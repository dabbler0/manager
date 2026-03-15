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

interface DepGraph {
  taskMap: Map<string, Task>;
  inDegree: Map<string, number>;
  /** reverse dependency map: depId → list of task IDs that depend on it */
  rdeps: Map<string, string[]>;
}

function buildDepGraph(taskSet: Task[]): DepGraph {
  const idSet = new Set(taskSet.map(t => t.id));
  const taskMap = new Map(taskSet.map(t => [t.id, t]));
  const inDegree = new Map(taskSet.map(t => [t.id, 0]));
  const rdeps = new Map(taskSet.map(t => [t.id, [] as string[]]));

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

/**
 * Greedy Earliest-Deadline-First schedule.
 * Returns the ordered sequence and any tasks that missed their wall-clock deadline.
 */
function greedyEDF(
  taskSet: Task[],
  hoursUntilDeadline: (t: Task) => number,
  now: Date,
): { sequence: Task[]; missed: Task[]; totalCost: number } {
  const { taskMap, inDegree, rdeps } = buildDepGraph(taskSet);
  let currentHours = 0;
  const sequence: Task[] = [];
  const missed: Task[] = [];
  const ready: Task[] = taskSet.filter(t => inDegree.get(t.id) === 0);

  while (ready.length > 0) {
    ready.sort((a, b) => {
      const diff = hoursUntilDeadline(a) - hoursUntilDeadline(b);
      // Tie-break by cost of failure descending
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

  return {
    sequence,
    missed,
    totalCost: missed.reduce((s, t) => s + (t.costOfFailure ?? 0), 0),
  };
}

/**
 * Greedy S/D maximization schedule.
 *
 * At each step, pick the ready task (no unfinished deps) with the highest S/D where:
 *   S = costOfFailure + benefitOfSuccess
 *   D = cumulative hours until that task completes
 *
 * Zero-value tasks (S=0) are scheduled shortest-first to unblock valuable tasks sooner.
 * Stops after the first task T with nonzero S is scheduled.
 */
function greedyMaxSD(taskSet: Task[]): Task[] {
  const { taskMap, inDegree, rdeps } = buildDepGraph(taskSet);
  let currentHours = 0;
  const sequence: Task[] = [];
  const ready: Task[] = taskSet.filter(t => inDegree.get(t.id) === 0);
  let foundFirstValueTask = false;

  while (ready.length > 0) {
    let best: Task | null = null;
    let bestScore = -Infinity;

    for (const t of ready) {
      const S = (t.costOfFailure ?? 0) + (t.benefitOfSuccess ?? 0);
      const D = currentHours + t.estimatedHours;
      const score =
        !foundFirstValueTask && S > 0 ? S / Math.max(0.01, D) // maximize S/D for first valuable task
        : !foundFirstValueTask        ? -D                     // minimize time for zero-value pre-tasks
        :                               0;                     // irrelevant after T is found
      if (score > bestScore) { bestScore = score; best = t; }
    }

    const t = best!;
    ready.splice(ready.indexOf(t), 1);
    currentHours += t.estimatedHours;
    sequence.push(t);

    const S = (t.costOfFailure ?? 0) + (t.benefitOfSuccess ?? 0);
    if (!foundFirstValueTask && S > 0) foundFirstValueTask = true;

    for (const rid of rdeps.get(t.id) ?? []) {
      const deg = (inDegree.get(rid) ?? 1) - 1;
      inDegree.set(rid, deg);
      if (deg === 0) ready.push(taskMap.get(rid)!);
    }
  }

  return sequence;
}

export function scheduleAndRecommend(allTasks: Task[], hoursPerDay: number): ScheduleResult {
  const now = new Date();
  const pending = allTasks.filter(t => !t.done);
  if (pending.length === 0) return { mode: 'empty', sequence: [], first: null };

  const sorted = topoSort(pending);

  function hoursUntilDeadline(t: Task): number {
    if (!t.dueDate) return Infinity;
    return Math.max(0, (new Date(t.dueDate).getTime() - now.getTime()) / 3_600_000);
  }

  const edf = greedyEDF(sorted, hoursUntilDeadline, now);

  if (edf.missed.length > 0) {
    // Try cost-rate weighted order as an alternative to EDF and keep the better result
    const costWeighted = [...sorted].sort((a, b) => {
      const rA = (a.costOfFailure ?? 0) / Math.max(1, hoursUntilDeadline(a));
      const rB = (b.costOfFailure ?? 0) / Math.max(1, hoursUntilDeadline(b));
      return rB - rA;
    });
    const cw = greedyEDF(costWeighted, hoursUntilDeadline, now);
    const best = cw.totalCost <= edf.totalCost ? cw : edf;
    return {
      mode: 'minimize-cost',
      sequence: best.sequence,
      first: best.sequence[0] ?? null,
      missed: best.missed,
      totalCost: best.totalCost,
    };
  }

  // All deadlines feasible — build maximize-S/D sequence up to first valuable task T
  const sdSequence = greedyMaxSD(sorted);
  let firstValueTask: Task | null = null;
  let firstValueD = 0;
  const displaySequence: Task[] = [];
  let hours = 0;

  for (const t of sdSequence) {
    hours += t.estimatedHours;
    displaySequence.push(t);
    const S = (t.costOfFailure ?? 0) + (t.benefitOfSuccess ?? 0);
    if (S > 0 && !firstValueTask) {
      firstValueTask = t;
      firstValueD = hours;
      break;
    }
  }

  return {
    mode: 'maximize-sd',
    sequence: displaySequence,
    first: displaySequence[0] ?? null,
    firstValueTask,
    firstValueD,
  };
}
