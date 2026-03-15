import type { Task } from './types';
import type { ScheduleResult } from './scheduler';
import { esc, formatDue, formatHours } from './utils';

function taskCard(t: Task): string {
  const due = t.dueDate ? formatDue(t.dueDate) : 'Sometime';
  return `
    <div class="hero-task-card">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">
        <span>${due}</span>
        <span>⏱ ${formatHours(t.estimatedHours)}</span>
        <span>💸 Cost: ${t.costOfFailure ?? 0}</span>
        <span>✨ Benefit: ${t.benefitOfSuccess ?? 0}</span>
      </div>
    </div>
  `;
}

function modeBadge(result: ScheduleResult): string {
  if (result.mode === 'minimize-cost') {
    return `<span class="badge badge-red">⚠ Deadlines at risk</span> — showing sequence to minimize cost of failure`;
  }
  return `<span class="badge badge-green">✓ On track</span> — showing sequence to maximize value/time`;
}

function sequenceList(result: ScheduleResult): string {
  const heading = result.mode === 'minimize-cost'
    ? 'Sequence to minimize missed cost'
    : 'Sequence to reach first valuable task T';

  const items = result.sequence.map((t, i) => {
    const isFirst = i === 0;
    const isTarget = result.mode === 'maximize-sd' && t === result.firstValueTask;
    const titleHtml = isFirst ? `<strong>${esc(t.title)}</strong>` : esc(t.title);
    const targetBadge = isTarget ? ' <span class="badge badge-yellow">★ T</span>' : '';
    const due = t.dueDate ? formatDue(t.dueDate) : 'Sometime';
    return `
      <li>
        <span class="seq-num">${i + 1}</span>
        <div class="seq-info">
          <div class="seq-title">${titleHtml}${targetBadge}</div>
          <div class="seq-meta">${formatHours(t.estimatedHours)} · ${due}</div>
        </div>
      </li>
    `;
  }).join('');

  return `
    <div class="hero-sequence">
      <h3>${heading}</h3>
      <ul class="sequence-list">${items}</ul>
    </div>
  `;
}

export function renderHero(result: ScheduleResult): void {
  const container = document.getElementById('heroContent')!;

  if (result.mode === 'empty' || !result.first) {
    container.innerHTML = `<div class="hero-empty">No pending tasks — you're all caught up!</div>`;
    return;
  }

  container.innerHTML = `
    <div class="hero-now">${taskCard(result.first)}</div>
    <div class="hero-mode">${modeBadge(result)}</div>
    ${sequenceList(result)}
  `;
}
