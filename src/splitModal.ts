import type { Task } from './types';
import { tasks, saveTasks } from './state';
import { genId, esc } from './utils';
import { openModal, closeModal } from './modal';

interface Subtask {
  title: string;
  hours: number;
}

export function openSplitModal(id: string, onSave: () => void): void {
  const orig = tasks.find(t => t.id === id);
  if (!orig) return;

  const subtasks: Subtask[] = [
    { title: `${orig.title} (part 1)`, hours: orig.estimatedHours / 2 },
    { title: `${orig.title} (part 2)`, hours: orig.estimatedHours / 2 },
  ];

  function buildHtml(): string {
    const rows = subtasks.map((s, i) => {
      const isLast = i === subtasks.length - 1;
      const hint = isLast ? 'inherits cost/benefit/due' : 'sometime, 0/0';
      const removeBtn = subtasks.length > 2
        ? `<button class="btn-ghost btn-sm" data-remove="${i}" style="color:var(--red)">Remove</button>`
        : '';
      return `
        <div class="subtask-row">
          <div class="subtask-row-header">
            <span>Subtask ${i + 1} (${hint})</span>
            ${removeBtn}
          </div>
          <div style="display:flex;gap:8px;">
            <input class="st-title" data-si="${i}" value="${esc(s.title)}"
              placeholder="Subtask title" style="flex:1" />
            <input class="st-hours" data-si="${i}" type="number" min="0.1" step="0.25"
              value="${s.hours}" style="width:70px;" title="Estimated hours" />
          </div>
        </div>
      `;
    }).join('');

    return `
      <h2>Split: "${esc(orig!.title)}"</h2>
      <p style="color:var(--muted);font-size:12px;margin-bottom:14px;">
        Creates a dependency chain. The last subtask inherits cost, benefit, and due date.
      </p>
      <div id="splitRows">${rows}</div>
      <button class="btn-ghost" id="btnAddSub" style="margin-top:6px;">+ Add subtask</button>
      <div class="modal-footer">
        <button class="btn-ghost" id="btnCancelSplit">Cancel</button>
        <button class="btn-primary" id="btnConfirmSplit">Split</button>
      </div>
    `;
  }

  function bind(overlay: HTMLElement): void {
    const rebind = () => { overlay.querySelector('.modal')!.innerHTML = buildHtml(); bind(overlay); };

    overlay.querySelector('#btnCancelSplit')!.addEventListener('click', closeModal);

    overlay.querySelector('#btnAddSub')!.addEventListener('click', () => {
      subtasks.push({ title: `${orig!.title} (part ${subtasks.length + 1})`, hours: 1 });
      rebind();
    });

    overlay.querySelectorAll<HTMLElement>('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        subtasks.splice(parseInt(btn.dataset.remove!), 1);
        rebind();
      });
    });

    overlay.querySelectorAll<HTMLInputElement>('.st-title').forEach(inp => {
      inp.addEventListener('input', () => { subtasks[parseInt(inp.dataset.si!)].title = inp.value; });
    });

    overlay.querySelectorAll<HTMLInputElement>('.st-hours').forEach(inp => {
      inp.addEventListener('input', () => { subtasks[parseInt(inp.dataset.si!)].hours = parseFloat(inp.value) || 1; });
    });

    overlay.querySelector('#btnConfirmSplit')!.addEventListener('click', () => {
      if (subtasks.some(s => !s.title.trim())) { alert('All subtasks need a title'); return; }
      if (subtasks.some(s => s.hours <= 0))    { alert('All subtasks need a positive hours estimate'); return; }

      // Remove original, insert chained subtasks in its place
      const origIdx = tasks.findIndex(t => t.id === id);
      if (origIdx === -1) return;
      tasks.splice(origIdx, 1);

      const newIds = subtasks.map(() => genId());
      const newTasks: Task[] = subtasks.map((s, i) => {
        const isLast = i === subtasks.length - 1;
        return {
          id: newIds[i],
          title: s.title.trim(),
          dueDate:          isLast ? orig!.dueDate          : null,
          costOfFailure:    isLast ? orig!.costOfFailure    : 0,
          benefitOfSuccess: isLast ? orig!.benefitOfSuccess : 0,
          estimatedHours:   s.hours,
          deps: i === 0 ? [...orig!.deps] : [newIds[i - 1]],
          done: false,
        };
      });

      tasks.push(...newTasks);
      saveTasks();
      closeModal();
      onSave();
    });
  }

  bind(openModal(buildHtml()));
}
