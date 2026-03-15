/** Open a modal overlay containing the given HTML. Returns the overlay element. */
export function openModal(html: string): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.getElementById('modalContainer')!.appendChild(overlay);
  return overlay;
}

export function closeModal(): void {
  const container = document.getElementById('modalContainer')!;
  if (container.lastChild) container.removeChild(container.lastChild);
}
