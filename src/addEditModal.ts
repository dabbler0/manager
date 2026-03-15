import type { Task } from './types';
import { tasks, saveTasks } from './state';
import { genId, esc } from './utils';
import { openModal, closeModal } from './modal';

interface FormValues {
  title: string;
  dueDate: string | null;
  costOfFailure: number;
  benefitOfSuccess: number;
  estimatedHours: number;
  deps: string[];
}

function readForm(overlay: HTMLElement): FormValues | null {
  const title = overlay.querySelector<HTMLInputElement>('#fTitle')!.value.trim();
  if (!title) { alert('Title is required'); return null; }

  const dueRaw = overlay.querySelector<HTMLInputElement>('#fDue')!.value;
  const costOfFailure    = parseFloat(overlay.querySelector<HTMLInputElement>('#fCost')!.value)    || 0;
  const benefitOfSuccess = parseFloat(overlay.querySelector<HTMLInputElement>('#fBenefit')!.value) || 0;
  const estimatedHours   = parseFloat(overlay.querySelector<HTMLInputElement>('#fHours')!.value)   || 1;
  const deps = Array.from(overlay.querySelector<HTMLSelectElement>('#fDeps')!.selectedOptions).map(o => o.value);

  return {
    title,
    dueDate: dueRaw ? new Date(dueRaw).toISOString() : null,
    costOfFailure,
    benefitOfSuccess,
    estimatedHours,
    deps,
  };
}

function formHtml(task: Task | null, modalTitle: string): string {
  const candidates = tasks.filter(t => t.id !== task?.id);
  const depIds = task?.deps ?? [];
  const depOptions = candidates.map(t =>
    `<option value="${t.id}" ${depIds.includes(t.id) ? 'selected' : ''}>${esc(t.title)}</option>`
  ).join('');

  return `
    <h2>${modalTitle}</h2>
    <div class="form-row">
      <label>Title</label>
      <input id="fTitle" value="${esc(task?.title ?? '')}" placeholder="Task name" />
    </div>
    <div class="form-row">
      <label>Due date/time (leave blank for "sometime")</label>
      <input id="fDue" type="datetime-local" value="${task?.dueDate ? task.dueDate.slice(0, 16) : ''}" />
    </div>
    <div style="display:flex;gap:12px;">
      <div class="form-row" style="flex:1">
        <label>Cost of failure</label>
        <input id="fCost" type="number" min="0" value="${task?.costOfFailure ?? 0}" />
      </div>
      <div class="form-row" style="flex:1">
        <label>Benefit of success</label>
        <input id="fBenefit" type="number" min="0" value="${task?.benefitOfSuccess ?? 0}" />
      </div>
    </div>
    <div class="form-row">
      <label>Estimated hours to complete</label>
      <input id="fHours" type="number" min="0.1" step="0.25" value="${task?.estimatedHours ?? 1}" />
    </div>
    <div class="form-row">
      <label>Dependencies (hold Ctrl/Cmd to select multiple)</label>
      <select id="fDeps" multiple style="height:80px;">${depOptions}</select>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" id="btnCancel">Cancel</button>
      <button class="btn-primary" id="btnSave">Save</button>
    </div>
  `;
}

export function openAddModal(onSave: () => void): void {
  const overlay = openModal(formHtml(null, 'New Task'));
  overlay.querySelector('#btnCancel')!.addEventListener('click', closeModal);
  overlay.querySelector('#btnSave')!.addEventListener('click', () => {
    const values = readForm(overlay);
    if (!values) return;
    tasks.push({ id: genId(), done: false, ...values });
    saveTasks();
    closeModal();
    onSave();
  });
}

export function openEditModal(id: string, onSave: () => void): void {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  const overlay = openModal(formHtml(task, 'Edit Task'));
  overlay.querySelector('#btnCancel')!.addEventListener('click', closeModal);
  overlay.querySelector('#btnSave')!.addEventListener('click', () => {
    const values = readForm(overlay);
    if (!values) return;
    Object.assign(task, values);
    saveTasks();
    closeModal();
    onSave();
  });
}
