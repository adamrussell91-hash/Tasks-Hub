import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import { projectProgress, statusBadgeClass, statusLabel, taskPageHash } from '@/domain/cards';
import {
  collectExcursionStops,
  layoutExcursionTimeline,
  TIMELINE_NODE_R,
  type LaidTimelineStop
} from '@/domain/excursion-timeline';
import { formatLeadTimes } from '@/domain/excursion';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { requestToggleDone } from '@/views/dashboard';
import { renderTaskMicroCard } from '@/views/hub-cards';
import { renderQuickAdd } from '@/views/task-editor';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderProgress(project: Project, tasks: Task[]): HTMLElement {
  const progress = projectProgress(project, tasks);
  const host = el('section', 'excursion-progress');
  host.setAttribute('aria-label', 'Excursion progress');
  const copy = el('div', 'excursion-progress__copy');
  const pct = el('p', 'hub-hero-metric');
  pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
  copy.append(
    pct,
    el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`)
  );
  const track = el('div', 'hub-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(progress.pct));
  track.setAttribute('aria-label', `${progress.pct} percent complete`);
  const fill = el('div', 'hub-track__fill');
  fill.style.width = `${progress.pct}%`;
  track.append(fill);
  host.append(copy, track);
  return host;
}

function renderNode(stop: LaidTimelineStop): SVGSVGElement {
  const size = TIMELINE_NODE_R * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `excursion-timeline__node${stop.kind === 'event' ? ' is-event' : ''}${stop.task?.status === 'done' ? ' is-done' : ''}`);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'map-tick__mark');
  circle.setAttribute('cx', String(TIMELINE_NODE_R));
  circle.setAttribute('cy', String(TIMELINE_NODE_R));
  circle.setAttribute('r', String(TIMELINE_NODE_R - 1.75));
  circle.setAttribute('fill', 'var(--paper)');
  circle.setAttribute('stroke', 'var(--marine)');
  circle.setAttribute('stroke-width', '3.5');
  svg.append(circle);
  return svg;
}

function renderEventChip(stop: LaidTimelineStop): HTMLElement {
  const chip = el('article', 'excursion-timeline__event');
  chip.append(
    el('span', 'hub-card__eyebrow', stop.kind === 'event' ? 'Event' : 'Key date'),
    el('h3', 'hub-row__title', stop.label),
    el('span', 'date-badge', formatDisplayDate(stop.date))
  );
  return chip;
}

function renderStop(
  stop: LaidTimelineStop,
  confirmHost: HTMLElement,
  reload: () => Promise<void>
): HTMLElement {
  const row = el('li', 'excursion-timeline__stop');
  row.style.marginTop = `${stop.gap}px`;
  row.dataset.kind = stop.kind;
  row.dataset.id = stop.id;
  const when = document.createElement('time');
  when.className = 'excursion-timeline__when';
  when.dateTime = stop.date;
  when.textContent = formatDisplayDate(stop.date);
  const rail = el('div', 'excursion-timeline__mark');
  rail.append(renderNode(stop));
  const body = el('div', 'excursion-timeline__card');
  if (stop.task) {
    const card = renderTaskMicroCard(stop.task, {
      onToggle: (task) => requestToggleDone(confirmHost, task, reload),
      onOpenPage: (task) => {
        location.hash = taskPageHash(task.id);
      }
    });
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    const open = () => {
      location.hash = taskPageHash(stop.task!.id);
    };
    card.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      open();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    body.append(card);
  } else {
    body.append(renderEventChip(stop));
  }
  row.append(when, rail, body);
  return row;
}

function renderDrafts(project: Project, template?: ExcursionTemplate): HTMLElement {
  const extras = el('section', 'excursion-detail');
  extras.append(el('h2', 'section-title', 'Drafted documents'));
  if (template) {
    extras.append(el('p', 'view-lede', `${template.name} · lead times ${formatLeadTimes(template)}`));
  }
  const docs = project.drafted_documents;
  if (!docs?.permission_note_draft && !docs?.staff_absence_email_draft) {
    extras.append(el('p', 'empty-state', 'No drafts on this excursion.'));
    return extras;
  }
  if (docs.permission_note_draft) {
    extras.append(el('h4', 'excursion-drafts__label', 'Permission note'));
    const pre = el('pre', 'excursion-draft');
    pre.textContent = docs.permission_note_draft;
    extras.append(pre);
  }
  if (docs.staff_absence_email_draft) {
    extras.append(el('h4', 'excursion-drafts__label', 'Staff absence email'));
    const pre = el('pre', 'excursion-draft');
    pre.textContent = docs.staff_absence_email_draft;
    extras.append(pre);
  }
  return extras;
}

/** Full-page excursion: kit progress tracker, then a dated MindWorks-style rail of task cards. */
export function paintExcursionPage(
  canvas: HTMLElement,
  project: Project,
  tasks: Task[],
  template: ExcursionTemplate | undefined,
  onReload: () => Promise<void>
): void {
  const page = el('div', 'excursion-page');
  const nav = el('div', 'page-editor__nav');
  const back = el('button', 'btn btn--ghost', 'Back to Excursions');
  back.type = 'button';
  back.addEventListener('click', () => {
    location.hash = '#/excursions';
  });
  nav.append(back);

  const head = el('header', 'excursion-page__head');
  head.append(
    el('span', 'hub-card__eyebrow', 'Excursion'),
    el('span', statusBadgeClass(project.status), statusLabel(project.status))
  );
  const title = el('h1', 'hub-card__title', project.title);
  const tags = el('div', 'hub-chips');
  tags.append(el('span', 'hub-chip', 'excursion'));
  if (project.student_group_reference) tags.append(el('span', 'hub-chip', project.student_group_reference));
  const lede = el('p', 'hub-card__meta', project.arc_summary || project.description || '');
  const intro = el('div', 'excursion-page__intro');
  intro.append(head, title, tags);
  if (lede.textContent) intro.append(lede);

  const confirmHost = el('div', 'excursion-confirm');
  const reload = () => onReload();

  const layout = layoutExcursionTimeline(collectExcursionStops(project, tasks));
  const scroller = el('div', 'excursion-timeline');
  scroller.setAttribute('tabindex', '0');
  scroller.setAttribute('aria-label', 'Excursion timeline');
  const inner = el('div', 'excursion-timeline__inner');
  inner.style.minHeight = `${layout.height}px`;
  const list = el('ol', 'excursion-timeline__list');
  const line = el('div', 'excursion-timeline__line');
  line.setAttribute('aria-hidden', 'true');
  if (!layout.stops.length) {
    list.append(el('p', 'empty-state', 'No dated tasks or key dates on this excursion yet.'));
  } else {
    for (const stop of layout.stops) list.append(renderStop(stop, confirmHost, reload));
  }
  inner.append(line, list);
  scroller.append(inner);

  page.append(
    nav,
    intro,
    renderProgress(project, tasks),
    renderQuickAdd(() => void reload(), project.id),
    confirmHost,
    scroller,
    renderDrafts(project, template)
  );
  canvas.replaceChildren(page);
}
