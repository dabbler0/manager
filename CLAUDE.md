# Task Manager — Project Structure

## Overview
Client-side task management app. TypeScript + Vite, no backend, no external UI dependencies.
All state persisted to `localStorage` under the key `taskmanager_v1`.

## File Layout
```
manager/
├── index.html          # HTML shell; Vite entry point
├── package.json        # npm scripts + devDependencies
├── tsconfig.json       # TypeScript config
├── src/
│   ├── main.ts         # Entry point: render loop + event listeners
│   ├── types.ts        # Task interface
│   ├── state.ts        # Shared tasks array + saveTasks()
│   ├── utils.ts        # genId, esc, formatDue, formatHours
│   ├── topoSort.ts     # DFS topological sort
│   ├── scheduler.ts    # scheduleAndRecommend + result types
│   ├── hero.ts         # renderHero — left "what to do now" panel
│   ├── tasks.ts        # renderTasks — right task list panel
│   ├── modal.ts        # openModal / closeModal utilities
│   ├── addEditModal.ts # Add / edit task modals
│   ├── splitModal.ts   # Split task into subtask chain
│   └── styles.css      # All CSS (imported by main.ts)
└── CLAUDE.md           # This file
```

## Development
```sh
npm install
npm run dev      # start Vite dev server
npm run build    # tsc type-check + Vite production build → dist/
npm run preview  # preview production build
```

## Data Model
Tasks are stored as a JSON array. Each task object:
```ts
interface Task {
  id: string;            // genId() — base-36 timestamp + random
  title: string;
  dueDate: string | null; // ISO 8601, null means "sometime"
  costOfFailure: number;
  benefitOfSuccess: number;
  estimatedHours: number;
  deps: string[];        // IDs of tasks this task depends on
  done: boolean;
}
```

## Module Responsibilities

### `state.ts`
Exports the shared mutable `tasks: Task[]` array (populated from localStorage on import) and
`saveTasks()`. All other modules that modify tasks use `push`, `splice`, and `Object.assign`
to keep the same array reference rather than reassigning.

### `scheduler.ts`
Pure functions only (no DOM, no state). `scheduleAndRecommend(tasks, hoursPerDay)` returns
a `ScheduleResult` in one of three modes:

**Mode: `minimize-cost`** (triggered when any task will miss its deadline)
- Runs greedy EDF and cost-rate (`costOfFailure / hoursUntilDeadline`) heuristics
- Picks whichever produces lower total `costOfFailure` for missed tasks
- Returns `{ mode, sequence, first, missed, totalCost }`

**Mode: `maximize-sd`** (all deadlines feasible)
- Greedy: pick ready task with highest `S/D` where `S = costOfFailure + benefitOfSuccess`,
  `D = cumulative hours until completion`
- Zero-value pre-tasks are scheduled shortest-first to unblock valuable tasks sooner
- Returns `{ mode, sequence, first, firstValueTask, firstValueD }`

**Mode: `empty`** — no pending tasks

### `hero.ts` / `tasks.ts`
Pure rendering functions — accept data as arguments, write to fixed DOM containers.
No side effects beyond DOM updates.

### `addEditModal.ts` / `splitModal.ts`
Accept an `onSave: () => void` callback (which is `render()` from `main.ts`).
Call `saveTasks()` internally, then invoke `onSave`. This pattern avoids circular imports
since the modals never import from `main.ts`.

### `modal.ts`
`openModal(html)` appends a new overlay to `#modalContainer` and returns the overlay element
so callers can attach event listeners to elements within it. `closeModal()` removes the
topmost overlay (supports stacked modals).

## UI Layout
```
┌─────────────────────┬─────────────────────┐
│   HERO (50%)        │   TASK LIST (50%)   │
│   "What to do now"  │   [search] [done✓]  │
│   ─────────────────  │   ───────────────── │
│   Task card          │   task item         │
│   mode badge         │   task item ...     │
│   sequence list      │                     │
└─────────────────────┴─────────────────────┘
```

## Key Algorithmic Notes

### Feasibility Check
Sequential schedule simulated with EDF priority. A task is "missed" if its wall-clock
completion time exceeds its deadline.

### Why Not Full Optimal Scheduling?
True optimal scheduling (min missed cost) is NP-hard. Two fast greedy heuristics are run
and the better result is kept:
1. EDF (Earliest Deadline First)
2. Cost-rate priority (`costOfFailure / hoursUntilDeadline` descending)

### S/D Maximization
`S/D` (value / time-to-completion) is a standard greedy criterion for maximizing value per
time invested. The algorithm is O(n²) worst case due to the ready-queue scan.
