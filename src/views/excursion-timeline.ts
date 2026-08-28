import type { Project, ProjectStatus, PermissionNote } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import type { Block } from '@/schemas/block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import { tasksApi } from '@/services/client-api';
import {
  formatRelativeUpdated,
  projectProgress,
  statusBadgeClass,
  statusLabel,
  taskPageHash
} from '@/domain/cards';
import {
  collectExcursionStops,
  layoutExcursionTimeline,
  TIMELINE_NODE_R,
  type LaidTimelineStop
} from '@/domain/excursion-timeline';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage } from '@/views/feedback';
import { requestToggleDone } from '@/views/dashboard';
import { renderTaskMicroCard } from '@/views/hub-cards';
import { renderQuickAdd } from '@/views/task-editor';
import { mountBlockInsert } from '@/views/block-insert';
import {
  createHubField,
  createHubFilter,
  createHubTextarea,
  el,
  type HubFilterOption
} from '@/views/hub-kit';

const PROJECT_STATUSES: ProjectStatus[] = ['active', 'stalled', 'revived', 'archived_dead'];

function pageBlocksOf(entity: Project): Block[] {
  return Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
}

function titleInput(value: string, label: string): HTMLInputElement {
  const input = el('input', 'hub-card__title page-card__title-input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function backLink(href: string, label: string): HTMLAnchorElement {
  const link = el('a', 'page-card__back', label) as HTMLAnchorElement;
  link.href = href;
  return link;
}

function pageFilter(
  className: string,
  key: string,
  options: HubFilterOption[],
  value: string,
  onChange: (value: string) => void
) {
  const filter = createHubFilter({
    key,
    label: key,
    defaultValue: value,
    options,
    value,
    onChange
  });
  filter.el.classList.add(className);
  return filter;
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

function renderJoiner(gap: number): HTMLElement {
  const joiner = el('div', 'excursion-timeline__joiner');
  joiner.setAttribute('aria-hidden', 'true');
  const length = Math.max(0, gap - TIMELINE_NODE_R * 2);
  joiner.style.height = `${length}px`;
  return joiner;
}

function renderNode(stop: LaidTimelineStop): SVGSVGElement {
  const size = TIMELINE_NODE_R * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute(
    'class',
    `excursion-timeline__node${stop.kind === 'event' ? ' is-event' : ''}${stop.task?.status === 'done' ? ' is-done' : ''}`
  );
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
  reload: () => Promise<void>,
  previous: LaidTimelineStop | null
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
  if (previous) rail.append(renderJoiner(stop.gap));
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

function renderPermissionTracker(
  project: Project,
  persist: (patch: Partial<Project>) => void
): HTMLElement {
  const notes: PermissionNote[] = [...(project.permission_notes ?? [])];
  const host = el('section', 'excursion-tracker');
  host.append(el('p', 'hub-card__eyebrow', 'Permission notes'));
  const list = el('ul', 'task-list');

  const paintItems = () => {
    list.replaceChildren();
    if (!notes.length) {
      list.append(el('li', 'empty-state', 'Add names as permission notes go out.'));
      return;
    }
    notes.forEach((note, index) => {
      const item = el('li', 'task-item');
      item.style.setProperty('--i', String(index));
      const label = el('label', 'task-check');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = note.returned;
      box.setAttribute('aria-label', `${note.name} returned`);
      box.addEventListener('change', () => {
        notes[index] = { ...note, returned: box.checked };
        persist({ permission_notes: [...notes] });
      });
      label.append(box, el('span', 'check-box'));
      const body = el('div', 'task-body');
      body.append(el('span', 'task-name', note.name));
      item.append(label, body);
      list.append(item);
    });
  };
  paintItems();

  const add = createHubField({
    ariaLabel: 'Student name',
    placeholder: 'Add a name'
  });
  const addBtn = el('button', 'btn btn--secondary', 'Add');
  addBtn.type = 'button';
  const submit = () => {
    const name = add.input.value.trim();
    if (!name) return;
    notes.push({ id: crypto.randomUUID(), name, returned: false });
    add.input.value = '';
    persist({ permission_notes: [...notes] });
    paintItems();
  };
  addBtn.addEventListener('click', submit);
  add.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  const addRow = el('div', 'page-card__fields');
  addRow.append(add.el, addBtn);
  host.append(list, addRow);
  return host;
}

function renderDrafts(project: Project, persist: (patch: Partial<Project>) => void): HTMLElement {
  const extras = el('section', 'excursion-detail');
  const docs = project.drafted_documents;
  if (!docs?.permission_note_draft && !docs?.staff_absence_email_draft) {
    return extras;
  }
  extras.append(el('p', 'hub-card__eyebrow', 'Drafts'));
  if (docs.permission_note_draft) {
    const note = createHubTextarea({
      ariaLabel: 'Permission note draft',
      className: 'page-card__notes',
      value: docs.permission_note_draft
    });
    note.input.addEventListener('input', () =>
      persist({
        drafted_documents: {
          ...currentDrafts(project, docs),
          permission_note_draft: note.input.value
        }
      })
    );
    extras.append(note.el);
  }
  if (docs.staff_absence_email_draft) {
    const email = createHubTextarea({
      ariaLabel: 'Staff absence email draft',
      className: 'page-card__notes',
      value: docs.staff_absence_email_draft
    });
    email.input.addEventListener('input', () =>
      persist({
        drafted_documents: {
          ...currentDrafts(project, docs),
          staff_absence_email_draft: email.input.value
        }
      })
    );
    extras.append(email.el);
  }
  return extras;
}

function currentDrafts(
  project: Project,
  docs: NonNullable<Project['drafted_documents']>
): NonNullable<Project['drafted_documents']> {
  return {
    permission_note_draft: docs.permission_note_draft ?? project.drafted_documents?.permission_note_draft ?? null,
    staff_absence_email_draft:
      docs.staff_absence_email_draft ?? project.drafted_documents?.staff_absence_email_draft ?? null
  };
}

function renderTimeline(
  project: Project,
  tasks: Task[],
  confirmHost: HTMLElement,
  reload: () => Promise<void>
): HTMLElement {
  const layout = layoutExcursionTimeline(collectExcursionStops(project, tasks));
  const scroller = el('div', 'excursion-timeline');
  scroller.setAttribute('tabindex', '0');
  scroller.setAttribute('aria-label', 'Excursion timeline');
  const inner = el('div', 'excursion-timeline__inner');
  inner.style.minHeight = `${layout.height}px`;
  const list = el('ol', 'excursion-timeline__list');
  if (!layout.stops.length) {
    list.append(el('p', 'empty-state', 'No dated tasks or key dates on this excursion yet.'));
  } else {
    let previous: LaidTimelineStop | null = null;
    for (const stop of layout.stops) {
      list.append(renderStop(stop, confirmHost, reload, previous));
      previous = stop;
    }
  }
  inner.append(list);
  scroller.append(inner);
  return scroller;
}

/** Full-page excursion: task card + progress, date, permission tracker, joined timeline. */
export function paintExcursionPage(
  canvas: HTMLElement,
  project: Project,
  tasks: Task[],
  _template: ExcursionTemplate | undefined,
  onReload: () => Promise<void>
): void {
  let current = project;
  let saveTimer: number | undefined;
  const errorHost = el('p', 'empty-state');
  errorHost.hidden = true;
  const updated = el('span', 'hub-card__meta', formatRelativeUpdated(project.updated_at));

  const persist = (patch: Partial<Project>) => {
    current = { ...current, ...patch };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi
        .updateProject(current.id, {
          title: current.title,
          description: current.description,
          arc_summary: current.arc_summary,
          status: current.status,
          current_end_date: current.current_end_date,
          student_group_reference: current.student_group_reference,
          permission_notes: current.permission_notes,
          drafted_documents: current.drafted_documents,
          page_blocks: current.page_blocks
        })
        .then(
          (next) => {
            current = { ...current, ...next };
            updated.textContent = formatRelativeUpdated(next.updated_at);
            errorHost.hidden = true;
            errorHost.textContent = '';
          },
          (err) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          }
        );
    }, 400);
  };

  const page = el('div', 'page-editor');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(backLink('#/excursions', '← Excursions'));
  if (project.status !== 'active') {
    head.append(el('span', statusBadgeClass(project.status), statusLabel(project.status)));
  }

  const title = titleInput(project.title, 'Excursion title');
  title.addEventListener('input', () => {
    const next = title.value.trim();
    if (!next) return;
    persist({ title: next });
  });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) title.value = current.title;
  });

  const fields = el('div', 'page-card__fields hub-toolbar');
  const status = pageFilter(
    'page-card__status',
    'Status',
    PROJECT_STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    project.status,
    (value) => persist({ status: value as ProjectStatus })
  );
  const due = createHubField({
    type: 'date',
    ariaLabel: 'Excursion date',
    value: project.current_end_date ?? '',
    className: 'page-card__due',
    onChange: (value) => persist({ current_end_date: value || null })
  });
  const group = createHubField({
    ariaLabel: 'Student group',
    placeholder: 'Student group',
    value: project.student_group_reference ?? '',
    className: 'page-card__group',
    onInput: (value) => persist({ student_group_reference: value.trim() || null })
  });
  fields.append(status.el, due.el, group.el);

  const notes = createHubTextarea({
    ariaLabel: 'Notes',
    className: 'page-card__notes',
    value: project.arc_summary || project.description
  });
  notes.input.addEventListener('input', () =>
    persist({ arc_summary: notes.input.value, description: notes.input.value })
  );

  const confirmHost = el('div', 'excursion-confirm');
  const reload = () => onReload();
  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(
    head,
    renderProgress(project, tasks),
    title,
    fields,
    notes.el,
    renderPermissionTracker(project, persist),
    renderQuickAdd(() => void reload(), project.id),
    foot
  );

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  try {
    const handle = mountBlockCanvas(canvasHost, {
      blocks: pageBlocksOf(current),
      idFactory: nextBlockIdFactory('block', pageBlocksOf(current)),
      onChange: (blocks) => persist({ page_blocks: blocks })
    });
    const add = el('div', 'page-editor__add');
    mountBlockInsert(add, {
      onInsert: (type) => handle.insertType(type)
    });
    layout.append(add, canvasHost);
  } catch (err) {
    layout.replaceChildren(
      el('p', 'empty-state', `Could not open the lesson canvas: ${errorMessage(err)}`)
    );
  }

  page.append(
    card,
    errorHost,
    confirmHost,
    renderTimeline(project, tasks, confirmHost, reload),
    renderDrafts(project, persist),
    layout
  );
  canvas.replaceChildren(page);
}
