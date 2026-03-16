import type { Task } from './types';
import { topoSort } from './topoSort';

export type ScheduleMode = 'empty' | 'minimize-cost' | 'maximize-sd';

export interface ScheduleResult {
  mode: ScheduleMode;
  sequence: Task[];
  first: Task | null;
  /** minimize-cost only */
  missed?: Task[];
  totalCost?: number;
  /** maximize-sd only */
  firstValueTask?: Task | null;
  firstValueD?: number;
}

// Above this task count we fall back to greedy heuristics (2^n · n becomes too slow)
const BITMASK_THRESHOLD = 20;

// ── Shared helpers ─────────────────────────────────────

interface DepGraph {
  taskMap: Map<string, Task>;
  inDegree: Map<string, number>;
  rdeps: Map<string, string[]>;
}

function buildDepGraph(taskSet: Task[]): DepGraph {
  const idSet  = new Set(taskSet.map(t => t.id));
  const taskMap = new Map(taskSet.map(t => [t.id, t]));
  const inDegree = new Map(taskSet.map(t => [t.id, 0]));
  const rdeps    = new Map(taskSet.map(t => [t.id, [] as string[]]));

  for (const t of taskSet) {
    for (const depId of t.deps) {
      if (idSet.has(depId)) {
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
        rdeps.get(depId)!.push(t.id);
      }
    }
  }
  return { taskMap, inDegree, rdeps };
}

// ── Problem 1: Minimize cost of missed deadlines ────────

/**
 * Exact solution via bitmask DP.
 *
 * State: dp[mask] = (minCost, minTimeAtMinCost) for completing exactly the tasks
 * in `mask` in some valid topological order.
 *
 * Transition: for each ready task i (all its deps are in mask), compute
 *   newTime = time[mask] + hours[i]
 *   newCost = cost[mask] + (newTime > deadline[i] ? costOfFailure[i] : 0)
 * Update dp[mask | (1<<i)] if (newCost, newTime) is lexicographically better.
 *
 * Correctness: masks are processed in increasing numeric order; since mask|(1<<i) > mask
 * always, every source state is finalized before its successors.
 *
 * Complexity: O(2^n · n). Only called when n ≤ BITMASK_THRESHOLD.
 */
function exactMinCostDP(
  tasks: Task[],
  deadlineHours: (t: Task) => number,
): { sequence: Task[]; missed: Task[]; totalCost: number } {
  const n = tasks.length;
  const idSet   = new Set(tasks.map(t => t.id));
  const taskIdx = new Map(tasks.map((t, i) => [t.id, i]));

  // Precompute dependency bitmask for each task (within this task set only)
  const depMask = tasks.map(t => {
    let m = 0;
    for (const depId of t.deps) {
      if (idSet.has(depId)) m |= (1 << taskIdx.get(depId)!);
    }
    return m;
  });

  const size = 1 << n;
  const dpCost: number[] = new Array(size).fill(Infinity);
  const dpTime: number[] = new Array(size).fill(Infinity);
  const parentMask: number[] = new Array(size).fill(-1);
  const parentTask: number[] = new Array(size).fill(-1);

  dpCost[0] = 0;
  dpTime[0] = 0;

  for (let mask = 0; mask < size; mask++) {
    if (dpCost[mask] === Infinity) continue;

    const curCost = dpCost[mask];
    const curTime = dpTime[mask];

    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) continue;                     // already scheduled
      if ((mask & depMask[i]) !== depMask[i]) continue;  // dependencies not yet done

      const t = tasks[i];
      const newTime = curTime + t.estimatedHours;
      const missed  = t.dueDate !== null && newTime > deadlineHours(t);
      const newCost = curCost + (missed ? (t.costOfFailure ?? 0) : 0);
      const newMask = mask | (1 << i);

      if (newCost < dpCost[newMask] ||
          (newCost === dpCost[newMask] && newTime < dpTime[newMask])) {
        dpCost[newMask] = newCost;
        dpTime[newMask] = newTime;
        parentMask[newMask] = mask;
        parentTask[newMask] = i;
      }
    }
  }

  // Reconstruct optimal sequence
  const fullMask = size - 1;
  const sequence: Task[] = [];
  let cur = fullMask;
  while (cur !== 0) {
    const ti = parentTask[cur];
    sequence.unshift(tasks[ti]);
    cur = parentMask[cur];
  }

  // Recompute missed list from the reconstructed sequence
  const missed: Task[] = [];
  let elapsed = 0;
  for (const t of sequence) {
    elapsed += t.estimatedHours;
    if (t.dueDate !== null && elapsed > deadlineHours(t)) missed.push(t);
  }

  return { sequence, missed, totalCost: dpCost[fullMask] };
}

/**
 * Greedy heuristic fallback for large n (> BITMASK_THRESHOLD).
 * Runs both EDF and cost-rate-weighted order, returns the lower-cost result.
 */
function heuristicMinCost(
  sorted: Task[],
  hoursUntilDeadline: (t: Task) => number,
  now: Date,
): { sequence: Task[]; missed: Task[]; totalCost: number } {
  function simulate(taskSet: Task[]): { sequence: Task[]; missed: Task[]; totalCost: number } {
    const { taskMap, inDegree, rdeps } = buildDepGraph(taskSet);
    let currentHours = 0;
    const sequence: Task[] = [];
    const missed: Task[]   = [];
    const ready: Task[]    = taskSet.filter(t => inDegree.get(t.id) === 0);

    while (ready.length > 0) {
      ready.sort((a, b) => {
        const diff = hoursUntilDeadline(a) - hoursUntilDeadline(b);
        return diff !== 0 ? diff : (b.costOfFailure ?? 0) - (a.costOfFailure ?? 0);
      });
      const t = ready.shift()!;
      currentHours += t.estimatedHours;
      if (t.dueDate) {
        const wallEnd = new Date(now.getTime() + currentHours * 3_600_000);
        if (wallEnd > new Date(t.dueDate)) missed.push(t);
      }
      sequence.push(t);
      for (const rid of rdeps.get(t.id) ?? []) {
        const deg = (inDegree.get(rid) ?? 1) - 1;
        inDegree.set(rid, deg);
        if (deg === 0) ready.push(taskMap.get(rid)!);
      }
    }
    return { sequence, missed, totalCost: missed.reduce((s, t) => s + (t.costOfFailure ?? 0), 0) };
  }

  const edf = simulate(sorted);
  const costWeighted = simulate(
    [...sorted].sort((a, b) => {
      const rA = (a.costOfFailure ?? 0) / Math.max(1, hoursUntilDeadline(a));
      const rB = (b.costOfFailure ?? 0) / Math.max(1, hoursUntilDeadline(b));
      return rB - rA;
    })
  );
  return costWeighted.totalCost <= edf.totalCost ? costWeighted : edf;
}

// ── Problem 2: Maximize S/D ─────────────────────────────

/**
 * Exact solution to the maximize-S/D problem.
 *
 * For a given choice of "first valuable task" T, the minimum achievable D is:
 *   D_min(T) = Σ hours(all transitive prerequisites of T) + T.estimatedHours
 *
 * This is because we must complete every transitive prerequisite before T, and
 * inserting any non-prerequisite task before T would only increase D (hurting S/D).
 *
 * Therefore the globally optimal T* = argmax { S(T) / D_min(T) } over tasks with S > 0.
 * The optimal sequence is: topoSort(prerequisites of T*), then T*.
 *
 * Complexity: O(n²).
 */
export function exactMaxSD(taskSet: Task[]): Task[] {
  const idSet   = new Set(taskSet.map(t => t.id));
  const taskMap = new Map(taskSet.map(t => [t.id, t]));

  function transitivePrereqs(start: Task): Task[] {
    const seen  = new Set<string>();
    const stack = start.deps.filter(id => idSet.has(id));
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      taskMap.get(id)?.deps.filter(d => idSet.has(d) && !seen.has(d)).forEach(d => stack.push(d));
    }
    return [...seen].map(id => taskMap.get(id)!);
  }

  let bestRatio   = -Infinity;
  let bestTarget: Task | null = null;
  let bestPrereqs: Task[] = [];

  for (const T of taskSet) {
    const S = (T.costOfFailure ?? 0) + (T.benefitOfSuccess ?? 0);
    if (S <= 0) continue;

    const prereqs     = transitivePrereqs(T);
    const prereqHours = prereqs.reduce((s, t) => s + t.estimatedHours, 0);
    const D           = prereqHours + T.estimatedHours;
    const ratio       = S / Math.max(0.001, D);

    if (ratio > bestRatio) {
      bestRatio   = ratio;
      bestTarget  = T;
      bestPrereqs = prereqs;
    }
  }

  // No task with nonzero value — return a valid topo ordering
  if (!bestTarget) return topoSort(taskSet);

  return [...topoSort(bestPrereqs), bestTarget];
}

// ── Main entry point ────────────────────────────────────

/**
 * Compute the recommended task sequence.
 *
 * @param now  Reference time for deadline calculations (defaults to the current time;
 *             injectable for deterministic testing).
 */
export function scheduleAndRecommend(
  allTasks: Task[],
  hoursPerDay: number,
  now: Date = new Date(),
): ScheduleResult {
  const pending = allTasks.filter(t => !t.done);
  if (pending.length === 0) return { mode: 'empty', sequence: [], first: null };

  const sorted = topoSort(pending);

  function deadlineHours(t: Task): number {
    if (!t.dueDate) return Infinity;
    return Math.max(0, (new Date(t.dueDate).getTime() - now.getTime()) / 3_600_000);
  }

  // Determine the minimum achievable miss-cost (also serves as the feasibility check)
  const minCostResult = pending.length <= BITMASK_THRESHOLD
    ? exactMinCostDP(pending, deadlineHours)
    : heuristicMinCost(sorted, deadlineHours, now);

  if (minCostResult.totalCost > 0) {
    return {
      mode: 'minimize-cost',
      sequence: minCostResult.sequence,
      first:    minCostResult.sequence[0] ?? null,
      missed:   minCostResult.missed,
      totalCost: minCostResult.totalCost,
    };
  }

  // All deadlines feasible — maximize S/D
  const sdSequence = exactMaxSD(sorted);
  let firstValueTask: Task | null = null;
  let firstValueD = 0;
  let hours = 0;

  for (const t of sdSequence) {
    hours += t.estimatedHours;
    const S = (t.costOfFailure ?? 0) + (t.benefitOfSuccess ?? 0);
    if (S > 0 && !firstValueTask) {
      firstValueTask = t;
      firstValueD    = hours;
      break;
    }
  }

  return {
    mode: 'maximize-sd',
    sequence: sdSequence,
    first:    sdSequence[0] ?? null,
    firstValueTask,
    firstValueD,
  };
}
