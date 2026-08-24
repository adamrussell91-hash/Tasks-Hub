import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { toDateKey } from '@/domain/queries';
import { detectPinchPoints } from '@/domain/pinch';
import {
  addMonths,
  addWeeks,
  calendarHash,
  collectCalendarItems,
  dayTaskMinutes,
  filterCalendarItems,
  formatLoad,
  itemsForDay,
  itemsInRange,
  isSameMonth,
  isWeekend,
  monthTitle,
  overdueItems,
  parseCalendarAnchor,
  pickSelectedDateKey,
  visibleDays,
  visibleOverflow,
  weekdayShort,
  WEEKDAY_HEADINGS,
  type CalendarFilters,
  type CalendarItem,
  type CalendarMode
} from '@/domain/calendar';
import { formatDisplayDate, formatDisplayDateRange } from '../../design-kit/js/format-display-date.js';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { renderPressureStrips } from '@/views/pinch-strip';
import { requestToggleDone } from '@/views/dashboard';
import { mountTaskCard } from '@/views/hub-cards';
import {
  createHubFilter,
  createHubPills,
  createHubSearch,
  createHubToolbar,
  domainFilterOptions,
  el
} from '@/views/hub-kit';

const MONTH_EVENT_LIMIT = 3;

const sessionFilters: CalendarFilters = {
  domain: 'all',
  projectId: 'all',
  query: '',
  includeDone: false,
  includeDates: true
};

let selectedDateKey: string | null = null;

function eventClass(item: CalendarItem): string {
  const parts = ['week-chip', 'cal-event', `cal-event--${item.kind}`];
  if (item.domain) parts.push(`cal-event--${item.domain}`);
  if (item.priority === 'urgent' || item.priority === 'high') parts.push(`cal-event--${item.priority}`);
  if (item.status === 'done' || item.status === 'dead') parts.push('cal-event--done');
  return parts.join(' ');
}

function eventLabel(item: CalendarItem): string {
  const bits = [
    item.title,
    item.kind === 'task' ? item.priority : item.subtitle,
    item.project_title,
    `due ${formatDisplayDate(item.date_key)}`
  ].filter(Boolean);
  return bits.join(', ');
}

function replaceHash(mode: CalendarMode, anchor: Date): void {
  const next = calendarHash(mode, anchor);
  if (location.hash !== next) history.replaceState(null, '', next);
}

function renderEventChip(
  item: CalendarItem,
  onOpen: (item: CalendarItem) => void
): HTMLButtonElement {
  const chip = el('button', eventClass(item), item.title);
  chip.type = 'button';
  chip.dataset.kind = item.kind;
  chip.dataset.date = item.date_key;
  chip.dataset.eventId = item.id;
  if (item.domain) chip.dataset.domain = item.domain;
  if (item.task) chip.dataset.taskId = item.task.id;
  chip.setAttribute('aria-label', eventLabel(item));
  chip.draggable = item.movable;
  chip.addEventListener('click', (event) => {
    event.stopPropagation();
    onOpen(item);
  });
  if (item.movable && item.task) {
    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/task-id', item.task!.id);
      event.dataTransfer?.setData('text/plain', item.task!.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      chip.classList.add('is-dragging');
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
    });
  }
  return chip;
}

function wireDropTarget(
  node: HTMLElement,
  dateKey: string,
  onDropTask: (taskId: string, dateKey: string) => void
): void {
  node.dataset.dropDate = dateKey;
  node.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    node.classList.add('is-drop-target');
  });
  node.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    node.classList.remove('is-drop-target');
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('is-drop-target');
    const taskId =
      event.dataTransfer?.getData('text/task-id') || event.dataTransfer?.getData('text/plain');
    if (!taskId) return;
    onDropTask(taskId, dateKey);
  });
}

function renderModePills(mode: CalendarMode, anchor: Date): HTMLElement {
  return createHubPills({
    label: 'Calendar range',
    role: 'tablist',
    items: [
      { id: 'week', label: 'Week' },
      { id: 'month', label: 'Month' }
    ],
    value: mode,
    onSelect: (id) => {
      location.hash = calendarHash(id, anchor);
    }
  });
}

export async function renderCalendarView(canvas: HTMLElement, mode: CalendarMode): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([
      tasksApi.listTasks(),
      tasksApi.listProjects().catch(() => [] as Project[])
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCalendarView(canvas, mode), 'Could not load calendar');
    return;
  }

  const today = new Date();
  let anchor = parseCalendarAnchor(hashQuery().get('date'), today);

  function allItems(): CalendarItem[] {
    return filterCalendarItems(collectCalendarItems(tasks, projects), sessionFilters);
  }

  async function reload(): Promise<void> {
    await renderCalendarView(canvas, mode);
  }

  async function openItem(item: CalendarItem, preview: HTMLElement): Promise<void> {
    selectedDateKey = item.date_key;
    preview.hidden = false;
    if (item.task) {
      preview.replaceChildren();
      await renderTaskEditor(preview, item.task, projects, () => void reload());
      const actions = el('div', 'calendar-preview__actions');
      const done = el('button', 'btn btn--secondary', item.task.status === 'done' ? 'Reopen' : 'Done');
      done.type = 'button';
      done.addEventListener('click', () => {
        requestToggleDone(preview, item.task!, () => reload());
      });
      actions.append(done);
      preview.append(actions);
      return;
    }
    preview.replaceChildren(
      el('p', 'graph-preview__eyebrow', item.subtitle ?? item.kind.replace('_', ' ')),
      el('h3', 'graph-preview__title', item.title),
      el(
        'p',
        'graph-preview__meta',
        [item.project_title, formatDisplayDate(item.date_key)].filter(Boolean).join(' · ')
      )
    );
  }

  function dropTask(taskId: string, dateKey: string): void {
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || task.due_date === dateKey) return;
    const previous = task.due_date;
    task.due_date = dateKey;
    paint();
    void tasksApi.updateTask(taskId, { due_date: dateKey }).then(
      (updated) => {
        const index = tasks.findIndex((entry) => entry.id === updated.id);
        if (index >= 0) tasks[index] = updated;
      },
      (err: unknown) => {
        if (task) task.due_date = previous;
        paint();
        const host = canvas.querySelector('.calendar-preview');
        if (host instanceof HTMLElement) {
          host.hidden = false;
          host.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not reschedule')));
        }
      }
    );
  }

  function shiftRange(delta: number): void {
    anchor = mode === 'week' ? addWeeks(anchor, delta) : addMonths(anchor, delta);
    selectedDateKey = null;
    replaceHash(mode, anchor);
    paint();
  }

  function goTo(date: Date): void {
    anchor = date;
    selectedDateKey = toDateKey(date);
    replaceHash(mode, date);
    paint();
  }

  function selectDay(day: Date): void {
    selectedDateKey = toDateKey(day);
    if (mode === 'month' && !isSameMonth(day, anchor)) {
      anchor = day;
      replaceHash(mode, day);
    }
    paint();
  }

  function paint(): void {
    const active = document.activeElement;
    const searchFocused =
      active instanceof HTMLInputElement && active.classList.contains('calendar-search');
    const searchPos = searchFocused ? active.selectionStart : null;
    const scrollTop = canvas.scrollTop;

    const items = allItems();
    const days = visibleDays(anchor, mode);
    selectedDateKey = pickSelectedDateKey(selectedDateKey, days, today, anchor);
    const todayKey = toDateKey(today);
    const rangeStart = days[0]!;
    const rangeEnd = days[days.length - 1]!;
    const rangeItems = itemsInRange(items, rangeStart, rangeEnd);
    const overdue = overdueItems(items, today);
    const pinchesByKey = new Map(
      detectPinchPoints(tasks, rangeStart, { days: days.length }).map((pinch) => [
        pinch.date_key,
        pinch
      ])
    );

    canvas.replaceChildren();

    const toolbar = createHubToolbar('calendar-toolbar');
    toolbar.append(renderModePills(mode, anchor));

    const nav = el('div', 'calendar-nav');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', mode === 'week' ? 'Week navigation' : 'Month navigation');
    const prev = el('button', 'btn btn--ghost', 'Previous');
    prev.type = 'button';
    prev.setAttribute('aria-label', mode === 'week' ? 'Previous week' : 'Previous month');
    prev.addEventListener('click', () => shiftRange(-1));
    const next = el('button', 'btn btn--ghost', 'Next');
    next.type = 'button';
    next.setAttribute('aria-label', mode === 'week' ? 'Next week' : 'Next month');
    next.addEventListener('click', () => shiftRange(1));
    const todayBtn = el('button', 'btn btn--secondary', 'Today');
    todayBtn.type = 'button';
    todayBtn.addEventListener('click', () => goTo(today));
    const label = el(
      'p',
      'calendar-nav__label',
      mode === 'week' ? formatDisplayDateRange(rangeStart, rangeEnd) : monthTitle(anchor)
    );
    nav.append(prev, label, todayBtn, next);
    nav.tabIndex = 0;
    nav.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        shiftRange(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        shiftRange(1);
      }
    });
    toolbar.append(nav);

    const loadMinutes = dayTaskMinutes(rangeItems);
    const summary = el(
      'p',
      'calendar-summary',
      `${rangeItems.length} on this ${mode} · ${formatLoad(loadMinutes) || 'no timed work'}`
    );
    toolbar.append(summary);
    canvas.append(toolbar);

    if (overdue.length) {
      const earliest = overdue[0]!;
      const strip = el('div', 'calendar-overdue');
      const jump = el(
        'button',
        'btn btn--ghost',
        `${overdue.length} overdue · earliest ${formatDisplayDate(earliest.date_key)}`
      );
      jump.type = 'button';
      jump.addEventListener('click', () => goTo(parseCalendarAnchor(earliest.date_key)));
      strip.append(jump);
      canvas.append(strip);
    }

    const filters = createHubToolbar('board-filter', 'calendar-filters');
    const search = createHubSearch({
      placeholder: 'Filter this calendar…',
      ariaLabel: 'Filter calendar',
      value: sessionFilters.query,
      inputClass: 'hub-search__input calendar-search',
      onInput: (value) => {
        sessionFilters.query = value;
        paint();
      }
    });
    filters.append(
      search.el,
      createHubFilter({
        key: 'Domain',
        label: 'Domain',
        defaultValue: 'all',
        options: domainFilterOptions(),
        value: sessionFilters.domain,
        onChange: (value) => {
          sessionFilters.domain = value as TaskDomain | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Project',
        label: 'Project',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All projects' },
          ...projects
            .filter((project) => project.status !== 'archived_dead')
            .map((project) => ({ value: project.id, label: project.title }))
        ],
        value: sessionFilters.projectId,
        onChange: (value) => {
          sessionFilters.projectId = value;
          paint();
        }
      }).el
    );
    filters.append(
      createHubPills({
        label: 'Calendar layers',
        items: [
          { id: 'done', label: 'Completed' },
          { id: 'dates', label: 'Milestones' }
        ],
        value: [
          ...(sessionFilters.includeDone ? (['done'] as const) : []),
          ...(sessionFilters.includeDates ? (['dates'] as const) : [])
        ],
        onSelect: (id) => {
          if (id === 'done') sessionFilters.includeDone = !sessionFilters.includeDone;
          else sessionFilters.includeDates = !sessionFilters.includeDates;
          paint();
        }
      })
    );
    canvas.append(filters);

    if (mode === 'week') {
      const pressure = el('div', 'pressure-host');
      renderPressureStrips(pressure, tasks, today, () => void reload());
      canvas.append(pressure);
    }

    const preview = el('aside', 'graph-preview week-preview calendar-preview');
    preview.hidden = true;
    preview.setAttribute('aria-live', 'polite');

    const showPreview = (item: CalendarItem) => {
      selectedDateKey = item.date_key;
      void openItem(item, preview);
    };

    if (mode === 'week') {
      canvas.append(renderWeekGrid(days, items, pinchesByKey, todayKey, selectedDateKey!, showPreview, selectDay, dropTask));
    } else {
      canvas.append(renderMonthGrid(days, items, pinchesByKey, todayKey, selectedDateKey!, anchor, showPreview, selectDay, dropTask));
    }

    canvas.append(renderAgenda(items, selectedDateKey!, mode, showPreview, () => void reload()));
    canvas.append(preview);

    canvas.scrollTop = scrollTop;
    if (searchFocused) {
      const input = canvas.querySelector<HTMLInputElement>('.calendar-search');
      if (input) {
        input.focus();
        if (searchPos != null) input.setSelectionRange(searchPos, searchPos);
      }
    }
  }

  paint();
}

function renderWeekGrid(
  days: Date[],
  items: CalendarItem[],
  pinchesByKey: Map<string, { severity: string }>,
  todayKey: string,
  selectedKey: string,
  onOpen: (item: CalendarItem) => void,
  onSelect: (day: Date) => void,
  onDrop: (taskId: string, dateKey: string) => void
): HTMLElement {
  const grid = el('div', 'week-grid');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Week calendar');
  for (const day of days) {
    const key = toDateKey(day);
    const pinch = pinchesByKey.get(key);
    const mods = [
      'week-col',
      pinch ? `week-col--${pinch.severity}` : '',
      key === todayKey ? 'week-col--today' : '',
      key === selectedKey ? 'week-col--selected' : '',
      isWeekend(day) ? 'week-col--weekend' : ''
    ]
      .filter(Boolean)
      .join(' ');
    const col = el('section', mods);
    col.setAttribute('role', 'gridcell');
    col.dataset.date = key;
    if (key === todayKey) col.setAttribute('aria-current', 'date');
    wireDropTarget(col, key, onDrop);
    col.addEventListener('click', () => onSelect(day));

    const head = el('div', 'week-col__head');
    const title = el('button', 'week-col__title', `${weekdayShort(day)} ${formatDisplayDate(day)}`);
    title.type = 'button';
    title.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect(day);
    });
    const add = el('button', 'btn btn--ghost week-col__add', '+');
    add.type = 'button';
    add.setAttribute('aria-label', `Add task on ${formatDisplayDate(day)}`);
    add.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect(day);
      queueMicrotask(() => {
        const field = document.querySelector<HTMLInputElement>(
          '.calendar-agenda .hub-search__input, .calendar-agenda .quick-add input'
        );
        field?.focus();
      });
    });
    head.append(title, add);
    col.append(head);

    const dayItems = itemsForDay(items, day);
    const minutes = dayTaskMinutes(dayItems);
    if (pinch || minutes) {
      const meta = el(
        'p',
        'week-col__load',
        [pinch ? (pinch.severity === 'overloaded' ? 'overloaded' : 'watch') : null, formatLoad(minutes)]
          .filter(Boolean)
          .join(' · ')
      );
      col.append(meta);
    }
    if (!dayItems.length) col.append(el('p', 'empty-state empty-state--compact', 'Nothing due.'));
    for (const item of dayItems) col.append(renderEventChip(item, onOpen));
    grid.append(col);
  }
  return grid;
}

function renderMonthGrid(
  days: Date[],
  items: CalendarItem[],
  pinchesByKey: Map<string, { severity: string }>,
  todayKey: string,
  selectedKey: string,
  monthAnchor: Date,
  onOpen: (item: CalendarItem) => void,
  onSelect: (day: Date) => void,
  onDrop: (taskId: string, dateKey: string) => void
): HTMLElement {
  const wrap = el('div', 'month-cal-wrap');
  const grid = el('div', 'month-cal');
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Month calendar');
  for (const heading of WEEKDAY_HEADINGS) {
    grid.append(el('div', 'month-cal__head', heading));
  }
  for (const day of days) {
    const key = toDateKey(day);
    const pinch = pinchesByKey.get(key);
    const outside = !isSameMonth(day, monthAnchor);
    const mods = [
      'month-cal__cell',
      pinch ? `month-cal__cell--${pinch.severity}` : '',
      key === todayKey ? 'month-cal__cell--today' : '',
      key === selectedKey ? 'month-cal__cell--selected' : '',
      outside ? 'month-cal__cell--outside' : '',
      isWeekend(day) ? 'month-cal__cell--weekend' : ''
    ]
      .filter(Boolean)
      .join(' ');
    const cell = el('section', mods);
    cell.setAttribute('role', 'gridcell');
    cell.dataset.date = key;
    if (key === todayKey) cell.setAttribute('aria-current', 'date');
    wireDropTarget(cell, key, onDrop);
    cell.addEventListener('click', () => onSelect(day));
    cell.addEventListener('dblclick', (event) => {
      event.preventDefault();
      onSelect(day);
      queueMicrotask(() => {
        const field = document.querySelector<HTMLInputElement>(
          '.calendar-agenda .hub-search__input, .calendar-agenda .quick-add input'
        );
        field?.focus();
      });
    });

    const num = el('button', 'month-cal__num', String(day.getDate()));
    num.type = 'button';
    num.setAttribute('aria-label', formatDisplayDate(day));
    num.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect(day);
    });
    cell.append(num);

    const dayItems = itemsForDay(items, day);
    const { visible, hidden } = visibleOverflow(dayItems, MONTH_EVENT_LIMIT);
    for (const item of visible) cell.append(renderEventChip(item, onOpen));
    if (hidden) {
      const more = el('button', 'month-cal__more', `+${hidden} more`);
      more.type = 'button';
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelect(day);
      });
      cell.append(more);
    }
    grid.append(cell);
  }
  wrap.append(grid);
  return wrap;
}

function renderAgenda(
  items: CalendarItem[],
  dateKey: string,
  mode: CalendarMode,
  onOpen: (item: CalendarItem) => void,
  onReload: () => void
): HTMLElement {
  const dayItems = itemsForDay(items, dateKey);
  const agenda = el('section', 'calendar-agenda');
  const head = el('div', 'calendar-agenda__head');
  head.append(el('h2', 'section-title', formatDisplayDate(dateKey)));
  if (mode === 'month') {
    const openWeek = el('button', 'btn btn--secondary', 'Open week');
    openWeek.type = 'button';
    openWeek.addEventListener('click', () => {
      location.hash = calendarHash('week', parseCalendarAnchor(dateKey));
    });
    head.append(openWeek);
  } else {
    const openMonth = el('button', 'btn btn--secondary', 'Open month');
    openMonth.type = 'button';
    openMonth.addEventListener('click', () => {
      location.hash = calendarHash('month', parseCalendarAnchor(dateKey));
    });
    head.append(openMonth);
  }
  agenda.append(head);
  agenda.append(
    el(
      'p',
      'view-lede',
      dayItems.length
        ? `${dayItems.length} on this day · ${formatLoad(dayTaskMinutes(dayItems)) || 'no timed work'}`
        : 'Nothing on this day yet — add one below.'
    )
  );

  const stack = el('div', 'task-stack calendar-agenda__stack');
  for (const item of dayItems) {
    if (item.task) {
      mountTaskCard(stack, item.task, {
        onEdit: () => onOpen(item)
      });
      continue;
    }
    const row = el('article', 'hub-row');
    row.dataset.kind = item.kind;
    row.append(el('p', 'hub-row__title', item.title));
    const chips = el('div', 'hub-chips');
    if (item.domain) {
      const chip = el('span', 'hub-chip', item.domain);
      chip.dataset.area = item.domain;
      chips.append(chip);
    }
    if (item.subtitle) chips.append(el('span', 'hub-chip', item.subtitle));
    if (item.priority) {
      const priority = el('span', 'priority-chip', item.priority);
      priority.dataset.priority = item.priority;
      chips.append(priority);
    }
    if (item.project_title) chips.append(el('span', 'hub-chip', item.project_title));
    row.append(chips);
    const foot = el('div', 'hub-row__foot');
    const meta = el('div', 'hub-row__foot-meta');
    const due = el('span', 'date-badge', formatDisplayDate(item.date_key));
    meta.append(due);
    foot.append(meta);
    row.append(foot);
    stack.append(row);
  }
  agenda.append(stack);
  agenda.append(renderQuickAdd(onReload, null, { dueDate: dateKey }));
  return agenda;
}

export async function renderWeekView(canvas: HTMLElement): Promise<void> {
  return renderCalendarView(canvas, 'week');
}

export async function renderMonthView(canvas: HTMLElement): Promise<void> {
  return renderCalendarView(canvas, 'month');
}

/** Test hook — reset session filters between specs. */
export function resetCalendarSession(): void {
  sessionFilters.domain = 'all';
  sessionFilters.projectId = 'all';
  sessionFilters.query = '';
  sessionFilters.includeDone = false;
  sessionFilters.includeDates = true;
  selectedDateKey = null;
}
