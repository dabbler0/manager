import './styles.css';
import { tasks, saveTasks } from './state';
import { scheduleAndRecommend } from './scheduler';
import { renderHero } from './hero';
import { renderTasks } from './tasks';
import { openAddModal } from './addEditModal';
import { openEditModal } from './addEditModal';
import { openSplitModal } from './splitModal';

function render(): void {
  const hoursPerDay = parseFloat(
    (document.getElementById('hoursPerDay') as HTMLInputElement).value
  ) || 8;

  renderHero(scheduleAndRecommend(tasks, hoursPerDay));

  const search   = (document.getElementById('searchInput') as HTMLInputElement).value.toLowerCase();
  const showDone = (document.getElementById('showDone') as HTMLInputElement).checked;
  renderTasks(tasks, search, showDone);
}

function deleteTask(id: string): void {
  if (!confirm('Delete this task?')) return;
  const idx = tasks.findIndex(t => t.id === id);
  if (idx !== -1) tasks.splice(idx, 1);
  tasks.forEach(t => { t.deps = t.deps.filter(d => d !== id); });
  saveTasks();
  render();
}

// ── Controls ────────────────────────────────────────────
document.getElementById('btnAdd')!.addEventListener('click', () => openAddModal(render));
document.getElementById('hoursPerDay')!.addEventListener('change', render);
document.getElementById('searchInput')!.addEventListener('input', render);
document.getElementById('showDone')!.addEventListener('change', render);

// ── Task list event delegation ───────────────────────────
document.getElementById('tasksList')!.addEventListener('click', e => {
  const target = e.target as HTMLElement;
  const item = target.closest<HTMLElement>('.task-item');
  if (!item) return;
  const id = item.dataset.id!;

  if (target.classList.contains('task-check')) {
    const task = tasks.find(t => t.id === id);
    if (task) { task.done = (target as HTMLInputElement).checked; saveTasks(); render(); }
    return;
  }

  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (action === 'edit')   openEditModal(id, render);
  if (action === 'delete') deleteTask(id);
  if (action === 'split')  openSplitModal(id, render);
});

render();
