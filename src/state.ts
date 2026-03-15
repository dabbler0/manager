import type { Task } from './types';

const STORAGE_KEY = 'taskmanager_v1';

/** Shared mutable task array. Populated from localStorage on module load. */
export const tasks: Task[] = (() => {
  try {
    return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Task[]) ?? [];
  } catch {
    return [];
  }
})();

export function saveTasks(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}
