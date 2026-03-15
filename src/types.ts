export interface Task {
  id: string;
  title: string;
  /** ISO 8601 datetime string, or null for "sometime" */
  dueDate: string | null;
  costOfFailure: number;
  benefitOfSuccess: number;
  estimatedHours: number;
  /** IDs of tasks this task depends on */
  deps: string[];
  done: boolean;
}
