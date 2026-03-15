import type { Task } from './types';

/** DFS-based topological sort. Dependencies are visited before dependents. */
export function topoSort(taskList: Task[]): Task[] {
  const map = new Map(taskList.map(t => [t.id, t]));
  const visited = new Set<string>();
  const result: Task[] = [];

  function visit(t: Task): void {
    if (visited.has(t.id)) return;
    visited.add(t.id);
    for (const depId of t.deps) {
      const dep = map.get(depId);
      if (dep) visit(dep);
    }
    result.push(t);
  }

  for (const t of taskList) visit(t);
  return result;
}
