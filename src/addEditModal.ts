import type { Task } from './types';
import { tasks, saveTasks } from './state';
import { genId, esc } from './utils';
import { openModal, closeModal } from './modal';
import { mountDatePicker, type DatePickerHandle } from './datepicker';
import { mountDepPicker, type DepPickerHandle } from './depPicker';

interface FormValues {
  title: string;
  dueDate: string | null;
  costOfFailure: number;
  benefitOfSuccess: number;
  estimatedHours: number;
  deps: string[];
}

function readForm(overlay: HTMLElement, dp: DatePickerHandle, ddp: DepPickerHandle): FormValues | null {
  const title = overlay.querySelector<HTMLInputElement>('#fTitle')!.value.trim();
  if (!title) { alert('Title is required'); return null; }

  const costOfFailure    = parseFloat(overlay.querySelector<HTMLInputElement>('#fCost')!.value)    || 0;
  const benefitOfSuccess = parseFloat(overlay.querySelector<HTMLInputElement>('#fBenefit')!.value) || 0;
  const estimatedHours   = parseFloat(overlay.querySelector<HTMLInputElement>('#fHours')!.value)   || 1;

  return { title, dueDate: dp.getValue(), costOfFailure, benefitOfSuccess, estimatedHours, deps: ddp.getSelected() };
}

function formHtml(task: Task | null, modalTitle: string): string {
  return `
    <h2>${modalTitle}</h2>
    <div class="form-row">
      <label>Title</label>
      <input id="fTitle" value="${esc(task?.title ?? '')}" placeholder="Task name" />
    </div>
    <div class="form-row">
      <label>Due date / time</label>
      <div id="fDuePicker"></div>
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
      <label>Dependencies</label>
      <div id="fDepPicker"></div>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" id="btnCancel">Cancel</button>
      <button class="btn-primary" id="btnSave">Save</button>
    </div>
  `;
}

function mountComponents(overlay: HTMLElement, task: Task | null): { dp: DatePickerHandle; ddp: DepPickerHandle } {
  const candidates = tasks.filter(t => t.id !== task?.id);
  const dp  = mountDatePicker(overlay.querySelector<HTMLElement>('#fDuePicker')!,  task?.dueDate ?? null);
  const ddp = mountDepPicker(overlay.querySelector<HTMLElement>('#fDepPicker')!, candidates, task?.deps ?? []);
  return { dp, ddp };
}

export function openAddModal(onSave: () => void): void {
  const overlay = openModal(formHtml(null, 'New Task'));
  const { dp, ddp } = mountComponents(overlay, null);

  overlay.querySelector('#btnCancel')!.addEventListener('click', closeModal);
  overlay.querySelector('#btnSave')!.addEventListener('click', () => {
    const values = readForm(overlay, dp, ddp);
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
  const { dp, ddp } = mountComponents(overlay, task);

  overlay.querySelector('#btnCancel')!.addEventListener('click', closeModal);
  overlay.querySelector('#btnSave')!.addEventListener('click', () => {
    const values = readForm(overlay, dp, ddp);
    if (!values) return;
    Object.assign(task, values);
    saveTasks();
    closeModal();
    onSave();
  });
}
