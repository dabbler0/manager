import type { Task } from './types';
import { esc } from './utils';

export interface DepPickerHandle {
  getSelected(): string[];
}

/**
 * Mount a searchable multi-select dependency picker into `container`.
 * `candidates` is the list of tasks the user may depend on (the editing task excluded).
 * `initialIds` are the IDs already selected.
 */
export function mountDepPicker(
  container: HTMLElement,
  candidates: Task[],
  initialIds: string[],
): DepPickerHandle {
  const selected = new Set<string>(initialIds);
  let filter = '';

  function getSelected(): string[] { return [...selected]; }

  function filteredCandidates(): Task[] {
    const q = filter.toLowerCase();
    return candidates.filter(t => !selected.has(t.id) && t.title.toLowerCase().includes(q));
  }

  function render(): void {
    const chips = [...selected].map(id => {
      const title = candidates.find(t => t.id === id)?.title ?? id;
      return `<span class="dep-chip">${esc(title)}<button class="dep-chip-remove" data-id="${id}" type="button">✕</button></span>`;
    }).join('');

    const options = filteredCandidates();
    const listItems = options.length > 0
      ? options.map(t => `<div class="dep-option" data-id="${t.id}">${esc(t.title)}</div>`).join('')
      : `<div class="dep-no-match">${candidates.length === 0 ? 'No other tasks' : filter ? 'No matches' : 'All tasks already selected'}</div>`;

    container.innerHTML = `
      <div class="dep-picker">
        <div class="dep-chips-row">${chips || '<span class="dep-none-label">None</span>'}</div>
        <input class="dep-search" placeholder="Search tasks to add…" value="${esc(filter)}"
          ${candidates.length === 0 ? 'disabled' : ''} />
        <div class="dep-list">${listItems}</div>
      </div>
    `;

    const searchEl = container.querySelector<HTMLInputElement>('.dep-search');

    // Restore cursor to end of input after re-render
    if (searchEl && filter) {
      searchEl.focus();
      const len = searchEl.value.length;
      searchEl.setSelectionRange(len, len);
    }

    // Bind events — use mousedown on options to fire before the input loses focus
    container.querySelectorAll<HTMLElement>('.dep-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent input blur
        selected.add(opt.dataset.id!);
        filter = '';
        render();
      });
    });

    container.querySelectorAll<HTMLElement>('.dep-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        selected.delete(btn.dataset.id!);
        render();
      });
    });

    searchEl?.addEventListener('input', () => {
      filter = searchEl.value;
      render();
    });
  }

  render();
  return { getSelected };
}
