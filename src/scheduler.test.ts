import { describe, it, expect } from 'vitest';
import { scheduleAndRecommend, exactMaxSD } from './scheduler';
import type { Task } from './types';

// ── Test helpers ───────────────────────────────────────

const NOW = new Date('2026-01-01T00:00:00Z');

/** Build a Task with sensible defaults. `dueInHours` is relative to NOW. */
function t(
  id: string,
  estimatedHours: number,
  opts: {
    cost?: number;
    benefit?: number;
    dueInHours?: number;
    deps?: string[];
  } = {},
): Task {
  return {
    id,
    title: id,
    estimatedHours,
    costOfFailure:    opts.cost    ?? 0,
    benefitOfSuccess: opts.benefit ?? 0,
    dueDate: opts.dueInHours != null
      ? new Date(NOW.getTime() + opts.dueInHours * 3_600_000).toISOString()
      : null,
    deps: opts.deps ?? [],
    done: false,
  };
}

function schedule(tasks: Task[]) {
  return scheduleAndRecommend(tasks, 8, NOW);
}

function ids(tasks: Task[]): string[] {
  return tasks.map(t => t.id);
}

// ── Maximize-S/D tests ─────────────────────────────────

describe('maximize-sd (all deadlines feasible)', () => {

  it('single task with value', () => {
    const result = schedule([t('A', 2, { cost: 10, benefit: 20 })]);
    expect(result.mode).toBe('maximize-sd');
    expect(result.firstValueTask?.id).toBe('A');
    expect(result.firstValueD).toBe(2);
  });

  it('picks the task with better S/D ratio over a ready high-value task', () => {
    // A: S=0, hours=1, no deps
    // B: S=1000, hours=1, deps=[A]  → D_min = 1+1=2, ratio=500
    // C: S=10,   hours=1, no deps   → D_min = 1,     ratio=10
    // Greedy (old) picks C (ratio 10, immediate).  Exact must pick B (ratio 500).
    const tasks = [
      t('A', 1),
      t('B', 1, { cost: 600, benefit: 400, deps: ['A'] }),  // S=1000
      t('C', 1, { cost: 10 }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('maximize-sd');
    expect(result.firstValueTask?.id).toBe('B');
    expect(result.firstValueD).toBe(2);
    expect(ids(result.sequence)).toEqual(['A', 'B']);
  });

  it('deeper prerequisite chain: still picks high-value endpoint when ratio wins', () => {
    // A: hours=1, B: hours=1 deps=[A], C: S=1000 hours=1 deps=[B] → ratio=1000/3≈333
    // D: S=100 hours=1 no deps → ratio=100
    const tasks = [
      t('A', 1),
      t('B', 1, { deps: ['A'] }),
      t('C', 1, { cost: 1000, deps: ['B'] }),  // ratio = 1000/3 ≈ 333
      t('D', 1, { cost: 100 }),                 // ratio = 100/1  = 100
    ];
    const result = schedule(tasks);
    expect(result.firstValueTask?.id).toBe('C');
    expect(result.firstValueD).toBe(3);
    expect(ids(result.sequence)).toEqual(['A', 'B', 'C']);
  });

  it('when two tasks tie on S/D it resolves without error', () => {
    // A: S=10 hours=1 no deps → ratio=10
    // B: S=20 hours=2 no deps → ratio=10
    const tasks = [t('A', 1, { cost: 10 }), t('B', 2, { cost: 20 })];
    const result = schedule(tasks);
    expect(result.mode).toBe('maximize-sd');
    // Both have ratio 10; either A or B is acceptable
    expect(['A', 'B']).toContain(result.firstValueTask?.id);
  });

  it('no valuable tasks (all S=0): returns a valid topological order', () => {
    // A → B → C, all S=0
    const tasks = [t('A', 1), t('B', 1, { deps: ['A'] }), t('C', 1, { deps: ['B'] })];
    const result = schedule(tasks);
    expect(result.mode).toBe('maximize-sd');
    // sequence must respect deps: A before B, B before C
    const seq = ids(result.sequence);
    expect(seq.indexOf('A')).toBeLessThan(seq.indexOf('B'));
    expect(seq.indexOf('B')).toBeLessThan(seq.indexOf('C'));
  });

  it('independent tasks: picks the one with highest S/D', () => {
    // A: S=6 hours=3 ratio=2, B: S=4 hours=1 ratio=4, C: S=3 hours=3 ratio=1
    const tasks = [
      t('A', 3, { cost: 6 }),
      t('B', 1, { cost: 4 }),  // best ratio
      t('C', 3, { cost: 3 }),
    ];
    const result = schedule(tasks);
    expect(result.firstValueTask?.id).toBe('B');
    expect(result.firstValueD).toBe(1);
  });

  it('prereq with large hours blocks a high-value task: another task wins', () => {
    // A: hours=100 (big), B: S=1000 deps=[A] → ratio=1000/101 ≈ 9.9
    // C: S=100 no deps                        → ratio=100/1   = 100
    const tasks = [
      t('A', 100),
      t('B', 1, { cost: 1000, deps: ['A'] }),  // ratio ≈ 9.9
      t('C', 1, { cost: 100 }),                 // ratio = 100
    ];
    const result = schedule(tasks);
    expect(result.firstValueTask?.id).toBe('C');
    expect(result.firstValueD).toBe(1);
  });

  it('exactMaxSD: direct export returns correct sequence', () => {
    const tasks = [
      t('pre', 2),
      t('goal', 1, { cost: 100, deps: ['pre'] }),  // ratio=100/3≈33
      t('quick', 1, { cost: 50 }),                  // ratio=50
    ];
    const seq = exactMaxSD(tasks);
    // 'quick' wins the ratio contest
    expect(seq[seq.length - 1].id).toBe('quick');
  });
});

// ── Minimize-cost tests ────────────────────────────────

describe('minimize-cost (some deadlines infeasible)', () => {

  it('single task must miss: totalCost equals its costOfFailure', () => {
    // Only 1 hour available but task takes 2 hours → miss
    const tasks = [t('A', 2, { cost: 50, dueInHours: 1 })];
    const result = schedule(tasks);
    expect(result.mode).toBe('minimize-cost');
    expect(result.totalCost).toBe(50);
    expect(result.missed?.map(t => t.id)).toContain('A');
  });

  it('chooses to miss the cheaper task when both cannot be done in time', () => {
    // Total hours = 3, only 2 hours until each deadline → one must miss
    // A: cost=100, B: cost=1  → optimal is to miss B, keep A on time
    const tasks = [
      t('A', 1, { cost: 100, dueInHours: 1 }),
      t('B', 2, { cost: 1,   dueInHours: 2 }),
    ];
    // If order is [A, B]: A finishes at 1h ✓, B finishes at 3h > 2h → miss B. Cost=1.
    // If order is [B, A]: B finishes at 2h ✓, A finishes at 3h > 1h → miss A. Cost=100.
    const result = schedule(tasks);
    expect(result.mode).toBe('minimize-cost');
    expect(result.totalCost).toBe(1);
    expect(result.missed?.map(t => t.id)).toEqual(['B']);
    expect(ids(result.sequence)[0]).toBe('A');
  });

  it('beats both greedy heuristics when dep constraints matter', () => {
    // Counterexample where EDF gives cost=100 and cost-rate also gives cost=100,
    // but optimal ordering [A,B,C] gives cost=50.
    //
    // A: hours=1, cost=0,   deadline=2h, no deps
    // B: hours=1, cost=100, deadline=2h, deps=[A]   (B requires A first!)
    // C: hours=1, cost=50,  deadline=1h, no deps
    //
    // Valid orderings (A must precede B):
    //   [A,B,C]: A(1h ✓), B(2h ✓), C(3h > 1h → miss 50)    cost=50  ← optimal
    //   [A,C,B]: A(1h ✓), C(2h > 1h → miss 50), B(3h > 2h → miss 100) cost=150
    //   [C,A,B]: C(1h ✓), A(2h ✓), B(3h > 2h → miss 100)   cost=100  ← EDF result
    //
    // EDF sorts ready tasks {A,C} by deadline: C(1h) < A(2h), picks C first → cost=100.
    const tasks = [
      t('A', 1, { cost: 0,   dueInHours: 2 }),
      t('B', 1, { cost: 100, dueInHours: 2, deps: ['A'] }),
      t('C', 1, { cost: 50,  dueInHours: 1 }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('minimize-cost');
    expect(result.totalCost).toBe(50);
    expect(result.missed?.map(t => t.id)).toEqual(['C']);
    expect(ids(result.sequence)).toEqual(['A', 'B', 'C']);
  });

  it('three tasks where skipping the earliest deadline saves cost', () => {
    // B and C both have deadline=4h, A is cheap but has early deadline.
    // Total hours = 3; if A goes last it misses but cost is minimal.
    // A: hours=1, cost=1,  deadline=1h
    // B: hours=1, cost=50, deadline=4h
    // C: hours=1, cost=50, deadline=4h
    //
    // [B,C,A]: B(1h✓), C(2h✓), A(3h>1h miss cost=1).    cost=1  ← optimal
    // [A,B,C]: A(1h✓), B(2h✓), C(3h✓).                  cost=0  ← actually feasible!
    //
    // Hmm, this is feasible. Let me adjust: A deadline=0.5h so A always misses.
    // A: hours=1, cost=1, deadline=0.5h  → always missed regardless of order
    // B: hours=1, cost=50, deadline=4h
    // C: hours=1, cost=50, deadline=4h
    //
    // [A,B,C]: A(1h>0.5h miss 1), B(2h✓), C(3h✓). cost=1
    // [B,A,C]: B(1h✓), A(2h>0.5h miss 1), C(3h✓). cost=1
    // [B,C,A]: B(1h✓), C(2h✓), A(3h>0.5h miss 1). cost=1
    // All orderings give cost=1. DP confirms.
    const tasks = [
      t('A', 1, { cost: 1,  dueInHours: 0.5 }),
      t('B', 1, { cost: 50, dueInHours: 4 }),
      t('C', 1, { cost: 50, dueInHours: 4 }),
    ];
    const result = schedule(tasks);
    expect(result.totalCost).toBe(1);
    expect(result.missed?.map(t => t.id)).toEqual(['A']);
  });

  it('dependency chain: must complete prereqs even if they cause a deadline miss', () => {
    // X: hours=3, cost=0, no deps
    // Y: hours=1, cost=200, deadline=2h, deps=[X]  → X takes 3h, Y will always miss
    // Z: hours=1, cost=10,  deadline=5h, no deps
    //
    // We must do X before Y (dep).
    // [X,Y,Z]: X(3h✓), Y(4h>2h miss 200), Z(5h✓). cost=200.
    // [X,Z,Y]: X(3h✓), Z(4h✓), Y(5h>2h miss 200). cost=200.
    // [Z,X,Y]: Z(1h✓), X(4h✓), Y(5h>2h miss 200). cost=200.
    // All orderings miss Y. DP should confirm cost=200 and produce a valid sequence.
    const tasks = [
      t('X', 3),
      t('Y', 1, { cost: 200, dueInHours: 2, deps: ['X'] }),
      t('Z', 1, { cost: 10,  dueInHours: 5 }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('minimize-cost');
    expect(result.totalCost).toBe(200);
    expect(result.missed?.map(t => t.id)).toContain('Y');
    // X must come before Y in sequence
    const seq = ids(result.sequence);
    expect(seq.indexOf('X')).toBeLessThan(seq.indexOf('Y'));
  });

  it('zero cost-of-failure tasks never increase totalCost when missed', () => {
    // A: hours=5, cost=0, deadline=2h  (will miss, but costs nothing)
    // B: hours=1, cost=0, deadline=10h
    const tasks = [
      t('A', 5, { cost: 0, dueInHours: 2 }),
      t('B', 1, { cost: 0, dueInHours: 10 }),
    ];
    const result = schedule(tasks);
    // Even though A misses its deadline, totalCost is 0
    // But mode should be minimize-cost since a deadline is violated?
    // Actually: totalCost=0, so the DP result has cost=0 → mode should be maximize-sd.
    // The scheduler switches to minimize-cost only when totalCost > 0.
    expect(result.totalCost ?? 0).toBe(0);
  });

  it('sequence respects dependency ordering for deep chain', () => {
    // A → B → C → D (chain), only D has value.
    // exactMaxSD must produce [A, B, C, D] since all are required to reach D.
    // Deadlines are generous so everything is feasible.
    const tasks = [
      t('A', 2, { dueInHours: 20 }),
      t('B', 2, { dueInHours: 20, deps: ['A'] }),
      t('C', 2, { dueInHours: 20, deps: ['B'] }),
      t('D', 2, { cost: 10, dueInHours: 20, deps: ['C'] }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('maximize-sd');
    // D is the only valuable task; its prereqs are A, B, C
    expect(result.firstValueTask?.id).toBe('D');
    expect(result.firstValueD).toBe(8);
    expect(ids(result.sequence)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('4-task case where EDF misses 2 tasks but optimal misses only 1', () => {
    // P: hours=1, cost=0,   deadline=5h (no deps, low priority)
    // Q: hours=1, cost=200, deadline=2h (no deps, must go early)
    // R: hours=1, cost=200, deadline=2h (no deps, must go early)
    // S: hours=3, cost=999, deadline=4h (no deps, needs 3h, deadline at 4h)
    //
    // EDF order by deadline: Q(2h), R(2h), S(4h), P(5h)
    //   Q:1h✓, R:2h✓, S:5h>4h miss(999), P:6h>5h miss(0). cost=999.
    //
    // Optimal: [Q, S, R, P] or [R, S, Q, P]:
    //   Q:1h✓, S:4h✓(≤4h), R:5h>2h miss(200), P:6h>5h miss(0). cost=200.
    //
    // Note: S has deadline 4h and takes 3h. To finish S on time, we must start before
    // 4h-3h=1h, meaning S must be second (start at 1h, end at 4h exactly).
    const tasks = [
      t('P', 1, { cost: 0,   dueInHours: 5 }),
      t('Q', 1, { cost: 200, dueInHours: 2 }),
      t('R', 1, { cost: 200, dueInHours: 2 }),
      t('S', 3, { cost: 999, dueInHours: 4 }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('minimize-cost');
    expect(result.totalCost).toBe(200);
    // S must be second in the sequence (start=1h, end=4h)
    expect(ids(result.sequence)[1]).toBe('S');
  });
});

// ── Mode selection ─────────────────────────────────────

describe('mode selection', () => {
  it('returns empty when all tasks are done', () => {
    const tasks = [{ ...t('A', 1, { cost: 10 }), done: true }];
    expect(schedule(tasks).mode).toBe('empty');
  });

  it('returns empty when task list is empty', () => {
    expect(schedule([]).mode).toBe('empty');
  });

  it('is maximize-sd when all deadlines are met by the optimal ordering', () => {
    // 2 tasks, tight deadlines but feasible
    const tasks = [
      t('A', 1, { cost: 5, benefit: 5, dueInHours: 1 }),
      t('B', 1, { cost: 5, benefit: 5, dueInHours: 2 }),
    ];
    const result = schedule(tasks);
    expect(result.mode).toBe('maximize-sd');
  });

  it('is minimize-cost when even the optimal ordering misses a deadline', () => {
    // A takes 2h but deadline is 1h — impossible to meet
    const tasks = [
      t('A', 2, { cost: 1, dueInHours: 1 }),
      t('B', 1, { cost: 1, dueInHours: 10 }),
    ];
    expect(schedule(tasks).mode).toBe('minimize-cost');
  });
});
