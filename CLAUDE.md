# Task Manager — Project Structure

## Overview
Single-file, self-contained client-side task management app (`index.html`). No build step, no server, no dependencies. All state persisted to `localStorage` under the key `taskmanager_v1`.

## File Layout
```
manager/
├── index.html   # Entire app (HTML + CSS + JS)
└── CLAUDE.md    # This file
```

## Data Model
Tasks are stored as a JSON array. Each task object:
```js
{
  id: string,            // genId() — base-36 timestamp + random
  title: string,
  dueDate: string|null,  // ISO 8601, null means "sometime"
  costOfFailure: number,
  benefitOfSuccess: number,
  estimatedHours: number,
  deps: string[],        // array of task IDs this task depends on
  done: boolean
}
```

## Code Sections (all inside `<script>`)

### DATA MODEL
- `genId()` — unique ID generator
- `loadTasks()` / `saveTasks()` — localStorage I/O
- Global `tasks` array

### TOPOLOGICAL SORT
- `topoSort(taskList)` — DFS-based topo sort respecting `deps`; returns ordered array

### SCHEDULING ALGORITHM (`scheduleAndRecommend`)
Returns one of two modes:

**Mode: `minimize-cost`** (triggered when any task will miss its deadline)
- Runs a greedy Earliest-Deadline-First (EDF) schedule
- Also runs a cost-weighted schedule (sort by `costOfFailure / hoursUntilDeadline`)
- Picks whichever produces lower total `costOfFailure` for missed tasks
- Returns `{ mode, sequence, first, missed, totalCost }`

**Mode: `maximize-sd`** (all deadlines feasible)
- Greedy algorithm: at each scheduling step, pick the ready task (no unfinished deps) with highest `S/D` where:
  - `S = costOfFailure + benefitOfSuccess`
  - `D = cumulative hours until that task completes`
- Pre-value tasks (S=0) are picked to minimize D (shortest first), to unblock valuable tasks sooner
- Stops building display sequence after first task T with nonzero S
- Returns `{ mode, sequence, first, firstValueTask, firstValueD }`

**Mode: `empty`** — no pending tasks

`hoursPerDay` is configurable via the UI header input (default 8).

### RENDER HERO (`renderHero`)
Left half of the screen. Shows:
- The first task in the recommended sequence, prominently
- Mode badge (red = deadlines at risk, green = on track)
- The full sequence list with per-task metadata

### RENDER TASKS (`renderTasks`)
Right half of the screen. Filterable by:
- Search text (title substring match)
- Show/hide completed tasks checkbox

### MODAL UTILITIES
- `openModal(html)` / `closeModal()` — simple overlay modal system

### ADD / EDIT MODAL
- `openAddModal()` — create new task
- `openEditModal(id)` — edit existing task
- `readForm(overlay)` — extracts form values; returns task fields object

### SPLIT MODAL (`openSplitModal`)
Splits a task into a chain of N subtasks (default 2):
- User specifies title + hours for each subtask
- Only the **last** subtask inherits `dueDate`, `costOfFailure`, `benefitOfSuccess`
- Earlier subtasks get `dueDate: null`, `costOfFailure: 0`, `benefitOfSuccess: 0`
- Dependencies form a chain: task[0] gets original's deps; task[i] depends on task[i-1]
- Original task is removed and replaced

### DELETE
- Removes task from array
- Also removes that task's ID from all other tasks' `deps` arrays

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

## Styling
CSS custom properties on `:root` for theming. Dark theme only. Uses CSS grid/flexbox. No external stylesheets or fonts (falls back to `system-ui`).

## Key Algorithmic Notes

### Feasibility Check
The app determines feasibility by simulating a sequential schedule (one task at a time) with EDF priority. A task is "missed" if its cumulative end time exceeds its wall-clock deadline.

### Why Not Full Optimal Scheduling?
True optimal scheduling (min missed cost) is NP-hard (related to weighted job scheduling with precedence). The app uses two fast greedy heuristics and picks the better result:
1. EDF (Earliest Deadline First)
2. Cost-rate priority (`costOfFailure / hoursUntilDeadline` descending)

### S/D Maximization
The quantity `S/D` (value / time-to-completion) is a standard greedy criterion for maximizing "value per time invested." The algorithm is O(n²) in the worst case due to the ready-queue scan.
