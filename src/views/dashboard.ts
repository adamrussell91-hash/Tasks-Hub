import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { adaptiveTodayTasks, backlogTasks, preferredDomains, searchEntities } from '@/domain/queries';
import { computeProjectVariance, formatSlip } from '@/domain/closure';
import { tasksApi } from '@/services/client-api';
import type { TaskTemplate, ProjectTemplate, ExcursionTemplate } from '@/schemas/templates';
import { renderPressureStrips } from '@/views/pinch-strip';
import { findStallCandidates } from '@/domain/stall';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage, renderLoadError, showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { mountProjectCard, mountTaskCard } from '@/views/hub-cards';
import { projectPageHash } from '@/domain/cards';
import type { TaskDomain, TaskPriority } from '@/schemas/task';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubSearch,
  createHubToolbar,
  domainFilterOptions,
  el,
  priorityFilterOptions
} from '@/views/hub-kit';

let dayDomain: TaskDomain | 'all' = 'all';
let dayPriority: TaskPriority | 'all' = 'all';
let backlogDomain: TaskDomain | 'all' = 'all';
let backlogPriority: TaskPriority | 'all' = 'all';
let backlogTag = '';
let projectStatusFilter: 'all' | 'stalled' | 'active' | 'closed' = 'all';
let projectQuery = '';
let searchDomain: TaskDomain | 'all' = 'all';
let searchKind: 'all' | 'tasks' | 'projects' = 'all';
let templateKind: 'all' | 'task' | 'project' | 'excursion' = 'all';

function appendTaskCard(
  host: HTMLElement,
  task: Task,
  confirmHost: HTMLElement,
  reload: () => Promise<void>,
  projects: Project[] = []
): void {
  mountTaskCard(host, task, {
    onToggle: (current) => requestToggleDone(confirmHost, current, reload),
    onDelete: (current) => confirmDeleteTask(confirmHost, current, reload),
    onEdit: (current) => void renderTaskEditor(confirmHost, current, projects, () => void reload())
  });
}

function confirmDeleteTask(host: HTMLElement, task: Task, reload: () => Promise<void>): void {
  showConfirmWrite(
    host,
    `Delete “${task.title}”`,
    'This removes the task from the hub.',
    async () => {
      await tasksApi.deleteTask(task.id, { agent: 'Tasks Hub', reason: 'Row delete' });
      await reload();
    },
    'Delete'
  );
}

export async function markTaskOpen(task: Task): Promise<void> {
  await tasksApi.updateTask(task.id, { status: 'open' });
}

export async function markTaskDone(task: Task, actualMinutes?: number): Promise<void> {
  if (actualMinutes != null && !Number.isNaN(actualMinutes)) {
    await tasksApi.recordClareActual(task.id, actualMinutes);
    return;
  }
  await tasksApi.updateTask(task.id, { status: 'done' });
}

/** Done that needs an actual: confirm card. Discard / cancel leaves status unchanged. */
export function requestToggleDone(
  host: HTMLElement,
  task: Task,
  onDone: () => Promise<void>
): void {
  if (task.status === 'done') {
    void markTaskOpen(task).then(onDone).catch((err) => {
      host.append(el('p', 'empty-state', errorMessage(err)));
    });
    return;
  }
  if (!(task.estimated_duration && task.actual_duration == null)) {
    void markTaskDone(task).then(onDone).catch((err) => {
      host.append(el('p', 'empty-state', errorMessage(err)));
    });
    return;
  }

  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm done');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', `Done — ${task.title}`));
  card.append(
    el(
      'p',
      'page-header__supporting',
      `Clare guessed ${task.estimated_duration} minutes. Discard leaves this task open.`
    )
  );
  const minutes = createHubField({
    type: 'number',
    ariaLabel: 'Actual minutes',
    min: '1',
    step: '5',
    value: String(task.estimated_duration)
  });
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const value = Number(minutes.input.value);
    if (!value || Number.isNaN(value)) {
      host.append(el('p', 'empty-state', 'Enter actual minutes, or Discard.'));
      return;
    }
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await markTaskDone(task, value);
      await onDone();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(minutes.el, actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function renderDayView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const today = new Date();
  const prefs = preferredDomains(today);
  const list = adaptiveTodayTasks(tasks, today).filter((t) => {
    if (dayDomain !== 'all' && t.domain !== dayDomain) return false;
    if (dayPriority !== 'all' && t.priority !== dayPriority) return false;
    return true;
  });

  canvas.replaceChildren();
  const intro = el(
    'p',
    'view-lede',
    `Focus: ${prefs.join(', ')} · ${formatDisplayDate(today)}`
  );
  canvas.append(intro);

  const filters = createHubToolbar();
  filters.append(
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: dayDomain,
      onChange: (value) => {
        dayDomain = value as TaskDomain | 'all';
        void renderDayView(canvas);
      }
    }).el,
    createHubFilter({
      key: 'Priority',
      label: 'Priority',
      defaultValue: 'all',
      options: priorityFilterOptions(),
      value: dayPriority,
      onChange: (value) => {
        dayPriority = value as TaskPriority | 'all';
        void renderDayView(canvas);
      }
    }).el
  );
  canvas.append(filters);

  const clareLink = el('p', 'clare-inline');
  const goClare = el('button', 'btn btn--secondary', 'Negotiate with Clare');
  goClare.type = 'button';
  goClare.addEventListener('click', () => {
    location.hash = '#/clare';
  });
  clareLink.append(goClare);
  canvas.append(clareLink);

  const pressure = el('div', 'pressure-host');
  renderPressureStrips(pressure, tasks, today, () => void renderDayView(canvas));
  canvas.append(pressure);

  const confirmHost = el('div', 'task-confirm');
  canvas.append(renderQuickAdd(() => void renderDayView(canvas)));
  canvas.append(confirmHost);

  if (!list.length) {
    canvas.append(el('p', 'empty-state', 'Nothing due today in the preferred domains. Check Backlog or Week.'));
    return;
  }
  const stack = el('div', 'task-stack');
  for (const task of list) {
    appendTaskCard(stack, task, confirmHost, () => renderDayView(canvas), projects);
  }
  canvas.append(stack);
}

export async function renderListView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
  let list = backlogTasks(tasks);
  if (backlogDomain !== 'all') list = list.filter((t) => t.domain === backlogDomain);
  if (backlogPriority !== 'all') list = list.filter((t) => t.priority === backlogPriority);
  if (backlogTag) list = list.filter((t) => t.tags.includes(backlogTag));
  canvas.replaceChildren();

  const filters = createHubToolbar('board-filter');
  filters.append(
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: backlogDomain,
      onChange: (value) => {
        backlogDomain = value as TaskDomain | 'all';
        void renderListView(canvas);
      }
    }).el,
    createHubFilter({
      key: 'Priority',
      label: 'Priority',
      defaultValue: 'all',
      options: priorityFilterOptions(),
      value: backlogPriority,
      onChange: (value) => {
        backlogPriority = value as TaskPriority | 'all';
        void renderListView(canvas);
      }
    }).el,
    createHubFilter({
      key: 'Tag',
      label: 'Tag',
      defaultValue: '',
      options: [{ value: '', label: 'All tags' }, ...tags.map((tag) => ({ value: tag, label: tag }))],
      value: backlogTag,
      onChange: (value) => {
        backlogTag = value;
        void renderListView(canvas);
      }
    }).el
  );
  canvas.append(filters);
  canvas.append(renderQuickAdd(() => void renderListView(canvas)));
  const confirmHost = el('div', 'task-confirm');
  canvas.append(confirmHost);
  if (!list.length) {
    canvas.append(el('p', 'empty-state', 'Backlog is clear.'));
    return;
  }
  const stack = el('div', 'task-stack');
  for (const task of list) {
    appendTaskCard(stack, task, confirmHost, () => renderListView(canvas), projects);
  }
  canvas.append(stack);
}

export async function renderProjectsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let flagWarning = '';
  try {
    await tasksApi.flagStalledProjects();
  } catch (err) {
    flagWarning = `Could not persist stall flags (${errorMessage(err)}). Showing quiet projects from local detection.`;
  }
  let projects: Project[];
  let tasks: Task[];
  let reviews: Awaited<ReturnType<typeof tasksApi.listReviewLogs>>;
  try {
    [projects, tasks, reviews] = await Promise.all([
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.listReviewLogs().catch(() => [])
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderProjectsView(canvas), 'Could not load projects');
    return;
  }

  const restoreSearch =
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.getAttribute('aria-label') === 'Filter projects';
  const searchPos = restoreSearch
    ? (document.activeElement as HTMLInputElement).selectionStart
    : null;

  canvas.replaceChildren();
  if (flagWarning) canvas.append(el('p', 'empty-state', flagWarning));

  const stallConfirmHost = el('div', 'stall-confirm');
  const closureConfirmHost = el('div', 'closure-confirm');
  canvas.append(closureConfirmHost, stallConfirmHost);
  const candidateIds = new Set(
    findStallCandidates(projects, tasks).map((c) => c.project.id)
  );
  const stalled = projects.filter((p) => p.status === 'stalled' || candidateIds.has(p.id));
  const live = projects.filter(
    (p) => p.status !== 'archived_dead' && !stalled.some((s) => s.id === p.id)
  );
  const closed = projects.filter((p) => p.status === 'archived_dead');
  const mergeTargets = projects.filter(
    (p) => p.status !== 'archived_dead' && p.status !== 'stalled'
  );
  const q = projectQuery.trim().toLowerCase();
  const matchesQuery = (project: Project) =>
    !q ||
    project.title.toLowerCase().includes(q) ||
    project.description.toLowerCase().includes(q) ||
    project.arc_summary.toLowerCase().includes(q);

  const toolbar = createHubToolbar();
  const search = createHubSearch({
    placeholder: 'Filter projects…',
    ariaLabel: 'Filter projects',
    value: projectQuery,
    onInput: (value) => {
      projectQuery = value;
      void renderProjectsView(canvas);
    }
  });
  toolbar.append(
    search.el,
    createHubPills({
      label: 'Project status',
      items: [
        { id: 'all', label: 'All' },
        { id: 'stalled', label: 'Stalled' },
        { id: 'active', label: 'Active' },
        { id: 'closed', label: 'Closed' }
      ],
      value: projectStatusFilter,
      onSelect: (id) => {
        projectStatusFilter = id;
        void renderProjectsView(canvas);
      }
    })
  );
  canvas.append(toolbar);

  const showStalled = projectStatusFilter === 'all' || projectStatusFilter === 'stalled';
  const showActive = projectStatusFilter === 'all' || projectStatusFilter === 'active';
  const showClosed = projectStatusFilter === 'all' || projectStatusFilter === 'closed';

  if (showStalled && stalled.length) {
    canvas.append(el('h2', 'section-title', 'Stalled — choose an outcome'));
    const stallStack = el('div', 'task-stack');
    for (const project of stalled.filter(matchesQuery)) {
      stallStack.append(
        renderStalledCard(project, tasks, mergeTargets, stallConfirmHost, () =>
          void renderProjectsView(canvas)
        )
      );
    }
    if (!stallStack.children.length) stallStack.append(el('p', 'empty-state', 'No stalled projects match.'));
    canvas.append(stallStack);
  }

  if (showActive) {
  canvas.append(el('h2', 'section-title', 'Active & revived'));
  const stack = el('div', 'task-stack');
  const visibleLive = live.filter(matchesQuery);
  for (const project of visibleLive) {
    stack.append(
      renderProjectClosureCard(project, tasks, closureConfirmHost, () =>
        void renderProjectsView(canvas)
      )
    );
  }
  if (!visibleLive.length) stack.append(el('p', 'empty-state', 'No active projects.'));
  canvas.append(stack);
  }

  if (showClosed && closed.length) {
    canvas.append(el('h2', 'section-title', 'Closed, buried & frankensteined'));
    const deadStack = el('div', 'task-stack');
    for (const project of closed.filter(matchesQuery)) {
      mountProjectCard(deadStack, project, tasks, {
        onOpenPage: (current) => {
          location.hash = projectPageHash(current.id);
        }
      });
    }
    canvas.append(deadStack);
  }

  if (reviews.length) {
    canvas.append(el('h2', 'section-title', 'Review log'));
    const logStack = el('div', 'task-stack');
    for (const review of [...reviews].reverse().slice(0, 8)) {
      const proj = projects.find((p) => p.id === review.project_id);
      const slip =
        review.slip_days === null || review.slip_days === undefined
          ? ''
          : review.slip_days === 0
            ? ' · on baseline'
            : review.slip_days > 0
              ? ` · +${review.slip_days}d vs baseline`
              : ` · ${review.slip_days}d vs baseline`;
      const row = el('article', 'task-row');
      row.append(
        el('h3', 'task-row__title', `${review.outcome} · ${proj?.title ?? review.project_id}`),
        el('p', 'task-row__desc', `${review.reason}${slip}`)
      );
      logStack.append(row);
    }
    canvas.append(logStack);
  }

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter projects"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}

function renderProjectClosureCard(
  project: Project,
  tasks: Task[],
  confirmHost: HTMLElement,
  onDone: () => void
): HTMLElement {
  const variance = computeProjectVariance(project, tasks);
  const wrap = el('div', variance.ready_to_close ? 'closure-card' : '');
  mountProjectCard(wrap, project, tasks, {
    onToggleChild: (task) => requestToggleDone(confirmHost, task, async () => onDone()),
    onAddTask: () => {
      confirmHost.replaceChildren(renderQuickAdd(async () => onDone(), project.id));
    },
    onOpenPage: (current) => {
      location.hash = projectPageHash(current.id);
    },
    onClose: variance.ready_to_close
      ? () => showCloseConfirm(confirmHost, project, variance.slip_days, onDone)
      : undefined
  });
  if (variance.slip_days !== null) {
    wrap.append(el('p', 'hub-card__meta', `Baseline ${formatSlip(variance.slip_days)}`));
  }
  return wrap;
}

function showCloseConfirm(
  host: HTMLElement,
  project: Project,
  slipDays: number | null,
  onDone: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm closure');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'closure-confirm__title', `Close ${project.title}`));
  const reason = createHubField({
    ariaLabel: 'Retrospective',
    placeholder: 'Short retrospective (required)'
  });
  const slipText =
    slipDays === null
      ? 'No baseline comparison.'
      : slipDays === 0
        ? 'Landed on baseline.'
        : slipDays > 0
          ? `${slipDays} days past baseline.`
          : `${Math.abs(slipDays)} days ahead of baseline.`;
  card.append(el('p', 'page-header__supporting', `${slipText} Do not apply until Confirm.`), reason.el);
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const text = reason.input.value.trim();
    if (!text) {
      host.append(el('p', 'empty-state', 'Add a retrospective first.'));
      return;
    }
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await tasksApi.closeProject(project.id, text);
      host.replaceChildren(el('p', 'canvas-status', 'Project closed.'));
      onDone();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Close failed')
      );
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderStalledCard(
  project: Project,
  tasks: Task[],
  mergeTargets: Project[],
  confirmHost: HTMLElement,
  onDone: () => void
): HTMLElement {
  const card = el('article', 'stall-card');
  const openCount = tasks.filter(
    (t) => t.parent_project_id === project.id && t.status !== 'done' && t.status !== 'dead'
  ).length;
  card.append(
    el('p', 'page-header__eyebrow', 'Stalled'),
    el('h3', 'task-row__title', project.title),
    el('p', 'task-row__desc', project.arc_summary || project.description),
    el('div', 'task-row__meta')
  );
  const meta = card.querySelector('.task-row__meta')!;
  meta.append(
    el('span', 'chip', project.type),
    el('span', 'chip chip--muted', `${openCount} open tasks`),
    el(
      'span',
      'chip chip--muted',
      project.stall_flagged_at ? `flagged ${formatDisplayDate(project.stall_flagged_at)}` : 'flagged'
    )
  );

  const reason = createHubField({
    ariaLabel: `Reason for ${project.title}`,
    placeholder: 'Short reason (required)'
  });

  const merge = createHubFilter({
    key: 'Merge into',
    label: 'Frankenstein into',
    defaultValue: '',
    options: [
      { value: '', label: 'Merge into… (for Frankenstein)' },
      ...mergeTargets
        .filter((p) => p.id !== project.id)
        .map((target) => ({ value: target.id, label: target.title }))
    ],
    value: ''
  });

  const actions = el('div', 'stall-card__actions');
  const outcomes: Array<{ id: 'revived' | 'frankensteined' | 'buried'; label: string }> = [
    { id: 'revived', label: 'Revive' },
    { id: 'frankensteined', label: 'Frankenstein' },
    { id: 'buried', label: 'Bury' }
  ];
  for (const outcome of outcomes) {
    const btn = el(
      'button',
      outcome.id === 'buried' ? 'btn btn--decisive' : 'btn btn--secondary',
      outcome.label
    );
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const text = reason.input.value.trim();
      if (!text) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Add a short reason first.'));
        return;
      }
      if (outcome.id === 'frankensteined' && !merge.getValue()) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Pick a merge target for Frankenstein.'));
        return;
      }
      showStallConfirm(confirmHost, project, outcome.id, text, merge.getValue() || null, onDone);
    });
    actions.append(btn);
  }

  card.append(reason.el, merge.el, actions);
  return card;
}

function showStallConfirm(
  host: HTMLElement,
  project: Project,
  outcome: 'revived' | 'frankensteined' | 'buried',
  reason: string,
  mergeInto: string | null,
  onDone: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm stall outcome');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'stall-confirm__title', `${outcome} · ${project.title}`));
  card.append(
    el(
      'p',
      'page-header__supporting',
      `${reason}${mergeInto ? ` · merge → ${mergeInto}` : ''}. Do not apply until Confirm.`
    )
  );
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await tasksApi.resolveStalledProject({
        project_id: project.id,
        outcome,
        reason,
        merge_into_project_id: mergeInto
      });
      host.replaceChildren(el('p', 'canvas-status', 'Outcome recorded.'));
      onDone();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Resolve failed')
      );
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
}

export async function renderSearchView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = el('form', 'search-form hub-toolbar');
  const search = createHubSearch({
    placeholder: 'Search tasks and projects…',
    ariaLabel: 'Search'
  });
  const results = el('div', 'task-stack');
  const runSearch = async () => {
    const q = search.input.value.trim();
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    try {
      const data = await tasksApi.search(q);
      const filtered = applySearchFilters(data.tasks, data.projects);
      paintSearch(results, filtered.tasks, filtered.projects);
    } catch {
      const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
      const data = searchEntities(tasks, projects, q);
      const filtered = applySearchFilters(data.tasks, data.projects);
      paintSearch(results, filtered.tasks, filtered.projects);
    }
  };
  form.append(
    search.el,
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: searchDomain,
      onChange: (value) => {
        searchDomain = value as TaskDomain | 'all';
        void runSearch();
      }
    }).el,
    createHubPills({
      label: 'Search in',
      items: [
        { id: 'all', label: 'All' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'projects', label: 'Projects' }
      ],
      value: searchKind,
      onSelect: (id) => {
        searchKind = id;
        void runSearch();
      }
    })
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  search.input.addEventListener('input', () => void runSearch());
  const confirmHost = el('div', 'task-confirm');
  canvas.append(form, results, confirmHost);
}

function applySearchFilters(tasks: Task[], projects: Project[]): { tasks: Task[]; projects: Project[] } {
  const nextTasks =
    searchKind === 'projects'
      ? []
      : searchDomain === 'all'
        ? tasks
        : tasks.filter((task) => task.domain === searchDomain);
  const nextProjects = searchKind === 'tasks' ? [] : projects;
  return { tasks: nextTasks, projects: nextProjects };
}

async function refreshSearch(host: HTMLElement): Promise<void> {
  const input = host.previousElementSibling?.querySelector('input');
  const q = input instanceof HTMLInputElement ? input.value.trim() : '';
  if (q.length < 2) {
    host.replaceChildren();
    return;
  }
  try {
    const data = await tasksApi.search(q);
    const filtered = applySearchFilters(data.tasks, data.projects);
    paintSearch(host, filtered.tasks, filtered.projects);
  } catch {
    const [allTasks, allProjects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
    const data = searchEntities(allTasks, allProjects, q);
    const filtered = applySearchFilters(data.tasks, data.projects);
    paintSearch(host, filtered.tasks, filtered.projects);
  }
}

function paintSearch(host: HTMLElement, tasks: Task[], projects: Project[]): void {
  host.replaceChildren();
  if (!tasks.length && !projects.length) {
    host.append(el('p', 'empty-state', 'No matches.'));
    return;
  }
  for (const project of projects) {
    mountProjectCard(host, project, tasks, {
      onOpenPage: (current) => {
        location.hash = projectPageHash(current.id);
      }
    });
  }
  const confirmHost = host.parentElement?.querySelector('.task-confirm');
  for (const task of tasks) {
    if (confirmHost instanceof HTMLElement) {
      appendTaskCard(host, task, confirmHost, () => refreshSearch(host), projects);
    }
  }
}

function showTemplateConfirm(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm template use');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  card.append(el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`));
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await onConfirm();
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function renderTemplatesView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let data: Awaited<ReturnType<typeof tasksApi.listTemplates>>;
  try {
    data = await tasksApi.listTemplates();
  } catch (err) {
    renderLoadError(canvas, err, () => void renderTemplatesView(canvas), 'Could not load templates');
    return;
  }
  canvas.replaceChildren();
  const confirmHost = el('div', 'template-confirm');
  const toolbar = createHubToolbar();
  toolbar.append(
    createHubPills({
      label: 'Template type',
      role: 'tablist',
      items: [
        { id: 'all', label: 'All' },
        { id: 'task', label: 'Task' },
        { id: 'project', label: 'Project' },
        { id: 'excursion', label: 'Excursion' }
      ],
      value: templateKind,
      onSelect: (id) => {
        templateKind = id;
        void renderTemplatesView(canvas);
      }
    })
  );
  canvas.append(toolbar);

  if (templateKind === 'all' || templateKind === 'task') {
  canvas.append(el('h2', 'section-title', 'Task templates'));
  const taskStack = el('div', 'task-stack');
  for (const tt of data.task_templates as TaskTemplate[]) {
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      showTemplateConfirm(
        confirmHost,
        `Create “${tt.name}”`,
        `This will create a ${tt.domain} task from the template and open Today.`,
        async () => {
          await tasksApi.createTaskFromTemplate(tt.id);
          location.hash = '#/day';
        }
      );
    });
    actions.append(use);
    row.append(el('h3', 'task-row__title', tt.name), el('span', 'chip', tt.domain), actions);
    taskStack.append(row);
  }
  canvas.append(taskStack);
  }

  if (templateKind === 'all' || templateKind === 'project' || templateKind === 'excursion') {
  canvas.append(el('h2', 'section-title', 'Project & excursion templates'));
  const projStack = el('div', 'task-stack');
  for (const pt of data.project_templates as ProjectTemplate[]) {
    if (templateKind === 'excursion' && pt.type !== 'excursion') continue;
    if (templateKind === 'project' && pt.type === 'excursion') continue;
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      if (pt.type === 'excursion' && pt.excursion_template_id) {
        location.hash = `#/excursions?template=${encodeURIComponent(pt.excursion_template_id)}`;
        return;
      }
      showTemplateConfirm(
        confirmHost,
        `Create “${pt.name}”`,
        `This will create a ${pt.type} project with ${pt.default_milestones.length} default milestone(s) and open Projects.`,
        async () => {
          await tasksApi.createProjectFromTemplate(pt.id);
          location.hash = '#/projects';
        }
      );
    });
    actions.append(use);
    row.append(el('h3', 'task-row__title', pt.name), el('span', 'chip', pt.type), actions);
    projStack.append(row);
  }
  for (const et of data.excursion_templates as ExcursionTemplate[]) {
    if (templateKind === 'project') continue;
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', () => {
      location.hash = `#/excursions?template=${encodeURIComponent(et.id)}`;
    });
    actions.append(use);
    row.append(
      el('h3', 'task-row__title', et.name),
      el('span', 'chip', 'excursion'),
      el('p', 'task-row__desc', et.checklist_items.join(' · ')),
      actions
    );
    projStack.append(row);
  }
  canvas.append(projStack);
  }
  canvas.append(confirmHost);
}
