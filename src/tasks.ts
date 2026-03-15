import type { Task } from './types';
import { esc, formatDue, formatHours } from './utils';

function taskDetails(t: Task, allTasks: Task[]): string {
  const depTags = t.deps
    .map(id => allTasks.find(x => x.id === id)?.title ?? id)
    .map(title => `<span class="dep-tag">${esc(title)}</span>`)
    .join('');

  const parts = [
    `<span>⏱ ${formatHours(t.estimatedHours)}</span>`,
    t.dueDate ? `<span>${formatDue(t.dueDate)}</span>` : '<span>Sometime</span>',
    t.costOfFailure  ? `<span>💸 ${t.costOfFailure}</span>`  : '',
    t.benefitOfSuccess ? `<span>✨ ${t.benefitOfSuccess}</span>` : '',
    depTags ? `<span>↳ Deps: ${depTags}</span>` : '',
  ];

  return parts.filter(Boolean).join('');
}

export function renderTasks(allTasks: Task[], search: string, showDone: boolean): void {
  const container = document.getElementById('tasksList')!;

  const filtered = allTasks.filter(t => {
    if (!showDone && t.done) return false;
    if (search && !t.title.toLowerCase().includes(search)) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">No tasks. Click "+ New Task" to add one.</div>`;
    return;
  }

  container.innerHTML = filtered.map(t => `
    <div class="task-item ${t.done ? 'done' : ''}" data-id="${t.id}">
      <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''} title="Mark done" />
      <div class="task-body">
        <div class="task-name ${t.done ? 'done-text' : ''}">${esc(t.title)}</div>
        <div class="task-details">${taskDetails(t, allTasks)}</div>
      </div>
      <div class="task-actions">
        <button class="btn-ghost btn-sm" data-action="split"  data-id="${t.id}" title="Split">✂</button>
        <button class="btn-ghost btn-sm" data-action="edit"   data-id="${t.id}" title="Edit">✏</button>
        <button class="btn-ghost btn-sm" data-action="delete" data-id="${t.id}" title="Delete" style="color:var(--red)">🗑</button>
      </div>
    </div>
  `).join('');
}
