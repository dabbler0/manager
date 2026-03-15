/** Generate a unique ID (base-36 timestamp + random suffix). */
export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Escape HTML special characters. */
export function esc(s: string | number): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a due date relative to now as an HTML string. */
export function formatDue(isoStr: string): string {
  const d = new Date(isoStr);
  const diffMs = d.getTime() - Date.now();
  if (diffMs < 0) return `<span class="overdue">Overdue: ${d.toLocaleDateString()}</span>`;
  const hrs = diffMs / 3_600_000;
  if (hrs < 48) return `Due in ${Math.round(hrs)}h`;
  return `Due in ${Math.round(hrs / 24)}d (${d.toLocaleDateString()})`;
}

/** Format an hour count as a human-readable string. */
export function formatHours(h: number): string {
  if (!h) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h}h`;
}
