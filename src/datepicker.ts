export interface DatePickerHandle {
  getValue(): string | null;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

/**
 * Mount a calendar-style date+time picker into `container`.
 * Returns a handle with `getValue()` that returns the ISO string or null.
 */
export function mountDatePicker(container: HTMLElement, initialValue: string | null): DatePickerHandle {
  let selected: Date | null = initialValue ? new Date(initialValue) : null;
  let viewYear  = selected?.getFullYear()  ?? new Date().getFullYear();
  let viewMonth = selected?.getMonth()     ?? new Date().getMonth();
  let isOpen = false;
  let outsideHandler: ((e: MouseEvent) => void) | null = null;

  // ── Helpers ────────────────────────────────────────────

  function getValue(): string | null { return selected?.toISOString() ?? null; }

  function shiftMonth(delta: number): void {
    viewMonth += delta;
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    if (viewMonth <  0) { viewMonth = 11; viewYear--; }
    renderPanel();
  }

  function selectDay(day: number): void {
    const h = parseInt(container.querySelector<HTMLInputElement>('.dp-hour')?.value   ?? '9');
    const m = parseInt(container.querySelector<HTMLInputElement>('.dp-minute')?.value ?? '0');
    selected  = new Date(viewYear, viewMonth, day, h, m);
    renderTrigger();
    renderPanel();
  }

  function applyTime(): void {
    if (!selected) return;
    const h = parseInt(container.querySelector<HTMLInputElement>('.dp-hour')!.value);
    const m = parseInt(container.querySelector<HTMLInputElement>('.dp-minute')!.value);
    selected = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate(),
      isNaN(h) ? 0 : h, isNaN(m) ? 0 : m);
    renderTrigger();
  }

  function clear(): void {
    selected = null;
    isOpen   = false;
    removeOutsideHandler();
    render();
  }

  function open(): void {
    isOpen = true;
    renderPanel();
    // Close if user clicks anywhere outside this component
    removeOutsideHandler();
    outsideHandler = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) {
        isOpen = false;
        removeOutsideHandler();
        renderPanel();
      }
    };
    setTimeout(() => document.addEventListener('click', outsideHandler!, true), 0);
  }

  function close(): void {
    isOpen = false;
    removeOutsideHandler();
    renderPanel();
  }

  function removeOutsideHandler(): void {
    if (outsideHandler) {
      document.removeEventListener('click', outsideHandler, true);
      outsideHandler = null;
    }
  }

  // ── HTML builders ──────────────────────────────────────

  function triggerHtml(): string {
    const display = selected
      ? selected.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : '';
    return `
      <div class="dp-trigger ${isOpen ? 'dp-trigger-open' : ''}">
        ${selected
          ? `<span class="dp-display">${display}</span>`
          : `<span class="dp-placeholder">No deadline (sometime)</span>`}
        <div class="dp-trigger-end">
          ${selected ? '<button class="dp-clear-x" type="button" title="Clear">✕</button>' : ''}
          <span class="dp-cal-icon">📅</span>
        </div>
      </div>
    `;
  }

  function calendarHtml(): string {
    const firstDow    = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today       = new Date();

    const cells: string[] = [];
    for (let i = 0; i < firstDow; i++) cells.push('<td></td>');
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
      const isSel   = selected?.getFullYear() === viewYear && selected?.getMonth() === viewMonth && selected?.getDate() === d;
      cells.push(`<td class="dp-day${isToday ? ' dp-today' : ''}${isSel ? ' dp-sel' : ''}" data-day="${d}">${d}</td>`);
    }
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push('<td></td>');

    let rows = '';
    for (let i = 0; i < cells.length; i += 7) rows += `<tr>${cells.slice(i, i + 7).join('')}</tr>`;

    const h = (selected?.getHours()   ?? 9).toString().padStart(2, '0');
    const m = (selected?.getMinutes() ?? 0).toString().padStart(2, '0');

    return `
      <div class="dp-panel">
        <div class="dp-cal-nav">
          <button class="dp-nav-btn" data-dir="-1" type="button">‹</button>
          <span class="dp-month-label">${MONTHS[viewMonth]} ${viewYear}</span>
          <button class="dp-nav-btn" data-dir="1"  type="button">›</button>
        </div>
        <table class="dp-table">
          <thead><tr>${DOW.map(d => `<th>${d}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="dp-time-row">
          <span class="dp-time-label">Time</span>
          <div class="dp-time-inputs">
            <input class="dp-hour"   type="number" min="0" max="23" value="${h}" />
            <span class="dp-colon">:</span>
            <input class="dp-minute" type="number" min="0" max="59" step="5" value="${m}" />
          </div>
          <button class="dp-apply-time" type="button">Apply</button>
        </div>
        <div class="dp-panel-footer">
          <button class="dp-clear-btn" type="button">Clear date</button>
          <button class="dp-done-btn" type="button">Done</button>
        </div>
      </div>
    `;
  }

  // ── Partial re-renders ─────────────────────────────────

  function renderTrigger(): void {
    container.querySelector('.dp-trigger-wrap')!.innerHTML = triggerHtml();
    bindTrigger();
  }

  function renderPanel(): void {
    container.querySelector('.dp-panel-wrap')!.innerHTML = isOpen ? calendarHtml() : '';
    if (isOpen) bindPanel();
  }

  function render(): void {
    container.innerHTML = `
      <div class="dp-wrap">
        <div class="dp-trigger-wrap">${triggerHtml()}</div>
        <div class="dp-panel-wrap">${isOpen ? calendarHtml() : ''}</div>
      </div>
    `;
    bindTrigger();
    if (isOpen) bindPanel();
  }

  // ── Event binding ──────────────────────────────────────

  function bindTrigger(): void {
    container.querySelector('.dp-trigger')?.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('.dp-clear-x')) return; // handled separately
      isOpen ? close() : open();
    });
    container.querySelector('.dp-clear-x')?.addEventListener('click', e => {
      e.stopPropagation();
      clear();
    });
  }

  function bindPanel(): void {
    container.querySelectorAll<HTMLElement>('.dp-nav-btn').forEach(btn =>
      btn.addEventListener('click', () => shiftMonth(parseInt(btn.dataset.dir!)))
    );
    container.querySelectorAll<HTMLElement>('.dp-day').forEach(cell =>
      cell.addEventListener('click', () => { if (cell.dataset.day) selectDay(parseInt(cell.dataset.day)); })
    );
    container.querySelector('.dp-apply-time')?.addEventListener('click', applyTime);
    container.querySelector('.dp-clear-btn')?.addEventListener('click',  clear);
    container.querySelector('.dp-done-btn')?.addEventListener('click',   close);
  }

  render();
  return { getValue };
}
