import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  adaptiveTodayTasks,
  backlogTasks,
  preferredDomains,
  searchEntities,
  toDateKey
} from '@/domain/queries';
import { computeProjectVariance, formatSlip } from '@/domain/closure';
import { tasksApi } from '@/services/client-api';
import type { TaskTemplate, ProjectTemplate, ExcursionTemplate } from '@/schemas/templates';
import { renderPressureStrips } from '@/views/pinch-strip';
import { findStallCandidates } from '@/domain/stall';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { errorMessage, renderLoadError, showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { mountProjectCard, mountTaskCard } from '@/views/hub-cards';
import { projectPageHash } from '@/domain/cards';
import type { TaskDomain, TaskPriority } from '@/schemas/task';

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

function upsertTask(list: Task[], task: Task): Task[] {
  const index = list.findIndex((entry) => entry.id === task.id);
  if (index >= 0) {
    list[index] = task;
    return list;
  }
  list.push(task);
  return list;
}

function dropTask(list: Task[], id: string): Task[] {
  return list.filter((entry) => entry.id !== id);
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
  const minutes = el('input', 'hub-search') as HTMLInputElement;
  minutes.type = 'number';
  minutes.min = '1';
  minutes.step = '5';
  minutes.value = String(task.estimated_duration);
  minutes.setAttribute('aria-label', 'Actual minutes');
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const value = Number(minutes.value);
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
  card.append(minutes, actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function renderDayView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderDayView(canvas), 'Could not load Today');
    return;
  }

  function paint(): void {
    const today = new Date();
    const list = adaptiveTodayTasks(tasks, today);
    const prefs = preferredDomains(today);
    const scrollTop = canvas.scrollTop;

    canvas.replaceChildren();
    canvas.append(
      el('p', 'view-lede', `Focus: ${prefs.join(', ')} · ${formatDisplayDate(today)}`)
    );

    const clareLink = el('p', 'clare-inline');
    const goClare = el('button', 'btn btn--secondary', 'Negotiate with Clare');
    goClare.type = 'button';
    goClare.addEventListener('click', () => {
      location.hash = '#/clare';
    });
    clareLink.append(goClare);
    canvas.append(clareLink);

    const pressure = el('div', 'pressure-host');
    renderPressureStrips(pressure, tasks, today, () => void paint());
    canvas.append(pressure);

    const confirmHost = el('div', 'task-confirm');
    canvas.append(
      renderQuickAdd(
        (created) => {
          upsertTask(tasks, created);
          paint();
        },
        null,
        { dueDate: toDateKey(today) }
      )
    );
    canvas.append(confirmHost);

    if (!list.length) {
      canvas.append(
        el('p', 'empty-state', 'Nothing due today in the preferred domains. Check Backlog or Week.')
      );
      canvas.scrollTop = scrollTop;
      return;
    }
    const stack = el('div', 'task-stack');
    for (const task of list) {
      appendTaskCard(
        stack,
        task,
        confirmHost,
        async () => {
          tasks = await tasksApi.listTasks().catch(() => dropTask(tasks, task.id));
          paint();
        },
        projects
      );
    }
    canvas.append(stack);
    canvas.scrollTop = scrollTop;
  }

  paint();
}

let backlogDomain: TaskDomain | 'all' = 'all';
let backlogPriority: TaskPriority | 'all' = 'all';
let backlogTag = '';

export async function renderListView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderListView(canvas), 'Could not load Backlog');
    return;
  }

  function paint(): void {
    const tags = [...new Set(tasks.flatMap((t) => t.tags))].sort();
    let list = backlogTasks(tasks);
    if (backlogDomain !== 'all') list = list.filter((t) => t.domain === backlogDomain);
    if (backlogPriority !== 'all') list = list.filter((t) => t.priority === backlogPriority);
    if (backlogTag) list = list.filter((t) => t.tags.includes(backlogTag));
    const scrollTop = canvas.scrollTop;

    canvas.replaceChildren();
    const filters = el('div', 'board-filter');
    filters.append(
      createHubFilter({
        key: 'Domain',
        label: 'Domain',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All domains' },
          ...(['teaching', 'life', 'wedding', 'health', 'other'] as const).map((d) => ({
            value: d,
            label: d
          }))
        ],
        value: backlogDomain,
        onChange: (value) => {
          backlogDomain = value as TaskDomain | 'all';
          paint();
        }
      }).el,
      createHubFilter({
        key: 'Priority',
        label: 'Priority',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All priorities' },
          ...(['urgent', 'high', 'medium', 'low'] as const).map((p) => ({ value: p, label: p }))
        ],
        value: backlogPriority,
        onChange: (value) => {
          backlogPriority = value as TaskPriority | 'all';
          paint();
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
          paint();
        }
      }).el
    );
    canvas.append(filters);
    canvas.append(
      renderQuickAdd((created) => {
        upsertTask(tasks, created);
        paint();
      })
    );
    const confirmHost = el('div', 'task-confirm');
    canvas.append(confirmHost);
    if (!list.length) {
      canvas.append(el('p', 'empty-state', 'Backlog is clear.'));
      canvas.scrollTop = scrollTop;
      return;
    }
    const stack = el('div', 'task-stack');
    for (const task of list) {
      appendTaskCard(
        stack,
        task,
        confirmHost,
        async () => {
          tasks = await tasksApi.listTasks().catch(() => dropTask(tasks, task.id));
          paint();
        },
        projects
      );
    }
    canvas.append(stack);
    canvas.scrollTop = scrollTop;
  }

  paint();
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

  if (stalled.length) {
    canvas.append(el('h2', 'section-title', 'Stalled — choose an outcome'));
    const stallStack = el('div', 'task-stack');
    for (const project of stalled) {
      stallStack.append(
        renderStalledCard(project, tasks, mergeTargets, stallConfirmHost, () =>
          void renderProjectsView(canvas)
        )
      );
    }
    canvas.append(stallStack);
  }

  canvas.append(el('h2', 'section-title', 'Active & revived'));
  const stack = el('div', 'task-stack');
  for (const project of live) {
    stack.append(
      renderProjectClosureCard(project, tasks, closureConfirmHost, () =>
        void renderProjectsView(canvas)
      )
    );
  }
  if (!live.length) stack.append(el('p', 'empty-state', 'No active projects.'));
  canvas.append(stack);

  if (closed.length) {
    canvas.append(el('h2', 'section-title', 'Closed, buried & frankensteined'));
    const deadStack = el('div', 'task-stack');
    for (const project of closed) {
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
  const reason = el('input', 'hub-search') as HTMLInputElement;
  reason.placeholder = 'Short retrospective (required)';
  reason.setAttribute('aria-label', 'Retrospective');
  const slipText =
    slipDays === null
      ? 'No baseline comparison.'
      : slipDays === 0
        ? 'Landed on baseline.'
        : slipDays > 0
          ? `${slipDays} days past baseline.`
          : `${Math.abs(slipDays)} days ahead of baseline.`;
  card.append(el('p', 'page-header__supporting', `${slipText} Do not apply until Confirm.`), reason);
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    const text = reason.value.trim();
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

  const reason = el('input', 'hub-search') as HTMLInputElement;
  reason.placeholder = 'Short reason (required)';
  reason.setAttribute('aria-label', `Reason for ${project.title}`);

  const merge = el('select', 'hub-filter') as HTMLSelectElement;
  merge.setAttribute('aria-label', 'Frankenstein into');
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Merge into… (for Frankenstein)';
  merge.append(blank);
  for (const target of mergeTargets.filter((p) => p.id !== project.id)) {
    const opt = document.createElement('option');
    opt.value = target.id;
    opt.textContent = target.title;
    merge.append(opt);
  }

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
      const text = reason.value.trim();
      if (!text) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Add a short reason first.'));
        return;
      }
      if (outcome.id === 'frankensteined' && !merge.value) {
        confirmHost.replaceChildren(el('p', 'empty-state', 'Pick a merge target for Frankenstein.'));
        return;
      }
      showStallConfirm(confirmHost, project, outcome.id, text, merge.value || null, onDone);
    });
    actions.append(btn);
  }

  card.append(reason, merge, actions);
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
  const form = el('form', 'search-form');
  const input = el('input', 'hub-search') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = 'Search tasks and projects…';
  input.setAttribute('aria-label', 'Search');
  const results = el('div', 'task-stack');
  form.append(input);
  form.addEventListener('submit', (e) => e.preventDefault());
  input.addEventListener('input', async () => {
    const q = input.value.trim();
    if (q.length < 2) {
      results.replaceChildren();
      return;
    }
    try {
      const data = await tasksApi.search(q);
      paintSearch(results, data.tasks, data.projects);
    } catch {
      const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
      const data = searchEntities(tasks, projects, q);
      paintSearch(results, data.tasks, data.projects);
    }
  });
  const confirmHost = el('div', 'task-confirm');
  canvas.append(form, results, confirmHost);
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
    paintSearch(host, data.tasks, data.projects);
  } catch {
    const [allTasks, allProjects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
    const data = searchEntities(allTasks, allProjects, q);
    paintSearch(host, data.tasks, data.projects);
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

  canvas.append(el('h2', 'section-title', 'Project & excursion templates'));
  const projStack = el('div', 'task-stack');
  for (const pt of data.project_templates as ProjectTemplate[]) {
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
  canvas.append(projStack, confirmHost);
}
