import type { Task } from './types';
import { tasks, saveTasks } from './state';
import { openModal, closeModal } from './modal';

/** Download all tasks as a JSON file. */
export function exportTasks(): void {
  const json = JSON.stringify(tasks, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `tasks-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Open a modal to import tasks from a JSON file. Calls `onLoad` after a successful import. */
export function openImportModal(onLoad: () => void): void {
  const overlay = openModal(`
    <h2>Import Tasks</h2>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px;">
      Select a <code>.json</code> file previously exported from this app.
    </p>
    <div class="form-row">
      <label>JSON file</label>
      <div class="file-input-wrap">
        <label class="file-input-label" for="importFile">Choose file…</label>
        <span class="file-input-name" id="importFileName">No file chosen</span>
        <input type="file" id="importFile" accept=".json" />
      </div>
    </div>
    <div class="form-row">
      <label>Import mode</label>
      <select id="importMode">
        <option value="replace">Replace all — discard existing tasks and load the file</option>
        <option value="merge">Merge — add tasks from file, skip duplicates by ID</option>
      </select>
    </div>
    <div id="importPreview" style="margin-bottom:4px;"></div>
    <div class="modal-footer">
      <button class="btn-ghost" id="btnCancelImport">Cancel</button>
      <button class="btn-primary" id="btnConfirmImport" disabled>Import</button>
    </div>
  `);

  const fileInput    = overlay.querySelector<HTMLInputElement>('#importFile')!;
  const confirmBtn   = overlay.querySelector<HTMLButtonElement>('#btnConfirmImport')!;
  const previewEl    = overlay.querySelector<HTMLElement>('#importPreview')!;
  const fileNameEl   = overlay.querySelector<HTMLElement>('#importFileName')!;

  let parsed: Task[] | null = null;

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileNameEl.textContent = file.name;

    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target!.result as string);
        if (!Array.isArray(data)) throw new Error('Root value must be a JSON array.');
        // Basic shape validation on first item
        if (data.length > 0) {
          const t = data[0];
          if (typeof t.id !== 'string' || typeof t.title !== 'string') {
            throw new Error('Items must have string "id" and "title" fields.');
          }
        }
        parsed = data as Task[];
        previewEl.innerHTML = `<span style="color:var(--green);font-size:12px;">✓ ${parsed.length} task${parsed.length !== 1 ? 's' : ''} found</span>`;
        confirmBtn.disabled = false;
      } catch (err) {
        parsed = null;
        previewEl.innerHTML = `<span style="color:var(--red);font-size:12px;">✕ ${err instanceof Error ? err.message : 'Parse error'}</span>`;
        confirmBtn.disabled = true;
      }
    };
    reader.readAsText(file);
  });

  overlay.querySelector('#btnCancelImport')!.addEventListener('click', closeModal);

  confirmBtn.addEventListener('click', () => {
    if (!parsed) return;
    const mode = overlay.querySelector<HTMLSelectElement>('#importMode')!.value;

    if (mode === 'replace') {
      tasks.length = 0;
      tasks.push(...parsed);
    } else {
      const existingIds = new Set(tasks.map(t => t.id));
      tasks.push(...parsed.filter(t => !existingIds.has(t.id)));
    }

    saveTasks();
    closeModal();
    onLoad();
  });
}
