import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import {
  adaptiveTodayTasks,
  backlogTasks,
  milestonesInMonth,
  preferredDomains,
  toDateKey,
  weekDays,
  tasksForDay,
  searchEntities
} from '@/domain/queries';
import { computeProjectVariance, formatSlip } from '@/domain/closure';
import { tasksApi } from '@/services/client-api';
import type { TaskTemplate, ProjectTemplate, ExcursionTemplate } from '@/schemas/templates';

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

function priorityClass(p: Task['priority']): string {
  return `task-row__priority task-row__priority--${p}`;
}

function renderTaskRow(task: Task, onToggle: (t: Task) => void): HTMLElement {
  const row = el('article', 'task-row');
  row.dataset.domain = task.domain;

  const top = el('div', 'task-row__top');
  const title = el('h3', 'task-row__title', task.title);
  const pri = el('span', priorityClass(task.priority), task.priority);
  top.append(title, pri);

  const meta = el('div', 'task-row__meta');
  meta.append(
    el('span', 'chip', task.domain),
    el('span', 'chip chip--muted', task.status.replace('_', ' '))
  );
  if (task.due_date) meta.append(el('span', 'chip chip--muted', `Due ${task.due_date.slice(0, 10)}`));
  if (task.framework_used) meta.append(el('span', 'chip', 'framework'));

  const actions = el('div', 'task-row__actions');
  const done = el('button', 'btn btn--secondary', task.status === 'done' ? 'Reopen' : 'Done');
  done.type = 'button';
  done.addEventListener('click', () => onToggle(task));
  actions.append(done);

  if (task.description) row.append(top, el('p', 'task-row__desc', task.description), meta, actions);
  else row.append(top, meta, actions);
  return row;
}

async function toggleDone(task: Task): Promise<void> {
  await tasksApi.updateTask(task.id, {
    status: task.status === 'done' ? 'open' : 'done'
  });
}

export async function renderDayView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const tasks = await tasksApi.listTasks();
  const today = new Date();
  const list = adaptiveTodayTasks(tasks, today);
  const prefs = preferredDomains(today);

  canvas.replaceChildren();
  const intro = el(
    'p',
    'view-lede',
    `Adaptive focus: ${prefs.join(', ')} · ${toDateKey(today)}`
  );
  canvas.append(intro);

  const form = renderQuickAdd(() => void renderDayView(canvas));
  canvas.append(form);

  if (!list.length) {
    canvas.append(el('p', 'empty-state', 'Nothing due today in the preferred domains. Check Backlog or Week.'));
    return;
  }
  const stack = el('div', 'task-stack');
  for (const task of list) {
    stack.append(
      renderTaskRow(task, async (t) => {
        await toggleDone(t);
        await renderDayView(canvas);
      })
    );
  }
  canvas.append(stack);
}

export async function renderWeekView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const tasks = await tasksApi.listTasks();
  const days = weekDays(new Date());
  canvas.replaceChildren();
  const grid = el('div', 'week-grid');
  for (const day of days) {
    const col = el('section', 'week-col');
    col.append(el('h3', 'week-col__title', day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })));
    const dayTasks = tasksForDay(tasks, day);
    if (!dayTasks.length) col.append(el('p', 'empty-state empty-state--compact', '—'));
    for (const task of dayTasks) {
      const item = el('button', 'week-chip', task.title);
      item.type = 'button';
      item.dataset.domain = task.domain;
      col.append(item);
    }
    grid.append(col);
  }
  canvas.append(grid);
}

export async function renderMonthView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const projects = await tasksApi.listProjects();
  const month = new Date();
  const items = milestonesInMonth(projects, month);
  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) + ' · milestones & key dates'
    )
  );
  if (!items.length) {
    canvas.append(el('p', 'empty-state', 'No milestones this month.'));
    return;
  }
  const stack = el('div', 'task-stack');
  for (const { project, milestone } of items) {
    const row = el('article', 'task-row');
    const meta = el('div', 'task-row__meta');
    meta.append(
      el('span', 'chip', project.title),
      el('span', 'chip chip--muted', milestone.due_date?.slice(0, 10) ?? '')
    );
    row.append(el('h3', 'task-row__title', milestone.title), meta);
    stack.append(row);
  }
  canvas.append(stack);
}

export async function renderListView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const tasks = await tasksApi.listTasks();
  const list = backlogTasks(tasks);
  canvas.replaceChildren();
  canvas.append(el('p', 'view-lede', 'Open tasks without a due date, filterable later by domain/tag/priority.'));
  canvas.append(renderQuickAdd(() => void renderListView(canvas)));
  if (!list.length) {
    canvas.append(el('p', 'empty-state', 'Backlog is clear.'));
    return;
  }
  const stack = el('div', 'task-stack');
  for (const task of list) {
    stack.append(
      renderTaskRow(task, async (t) => {
        await toggleDone(t);
        await renderListView(canvas);
      })
    );
  }
  canvas.append(stack);
}

export async function renderProjectsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const [projects, tasks, reviews] = await Promise.all([
    tasksApi.listProjects(),
    tasksApi.listTasks(),
    tasksApi.listReviewLogs().catch(() => [])
  ]);

  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      'Programs and arcs. Close finished work with a short retrospective — baseline vs current end date is logged.'
    )
  );

  const confirmHost = el('div', 'closure-confirm');
  const live = projects.filter((p) => p.status !== 'archived_dead');
  const closed = projects.filter((p) => p.status === 'archived_dead');

  const stack = el('div', 'task-stack');
  for (const project of live) {
    stack.append(
      await renderProjectClosureCard(project, tasks, confirmHost, () => void renderProjectsView(canvas))
    );
  }
  if (!live.length) stack.append(el('p', 'empty-state', 'No open projects.'));
  canvas.append(stack, confirmHost);

  if (closed.length) {
    canvas.append(el('h2', 'section-title', 'Closed'));
    const dead = el('div', 'task-stack');
    for (const project of closed) {
      const row = el('article', 'task-row');
      row.append(
        el('h3', 'task-row__title', project.title),
        el('p', 'task-row__desc', project.review_summary || project.arc_summary || ''),
        el('span', 'chip chip--muted', 'closed')
      );
      dead.append(row);
    }
    canvas.append(dead);
  }

  const closedReviews = reviews.filter((r) => r.outcome === 'closed');
  if (closedReviews.length) {
    canvas.append(el('h2', 'section-title', 'Closure log'));
    const logStack = el('div', 'task-stack');
    for (const review of [...closedReviews].reverse().slice(0, 8)) {
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
        el('h3', 'task-row__title', proj?.title ?? review.project_id),
        el('p', 'task-row__desc', `${review.reason}${slip}`)
      );
      logStack.append(row);
    }
    canvas.append(logStack);
  }
}

async function renderProjectClosureCard(
  project: Project,
  tasks: Task[],
  confirmHost: HTMLElement,
  onDone: () => void
): Promise<HTMLElement> {
  const variance = computeProjectVariance(project, tasks);
  const row = el('article', variance.ready_to_close ? 'task-row closure-card' : 'task-row');
  row.append(
    el('h3', 'task-row__title', project.title),
    el('p', 'task-row__desc', project.arc_summary || project.description),
    el('div', 'task-row__meta')
  );
  const meta = row.querySelector('.task-row__meta')!;
  meta.append(
    el('span', 'chip', project.type),
    el('span', 'chip chip--muted', project.status),
    el('span', 'chip chip--muted', formatSlip(variance.slip_days)),
    el(
      'span',
      'chip chip--muted',
      `baseline ${variance.baseline_end_date?.slice(0, 10) ?? '—'} → now ${variance.derived_end_date?.slice(0, 10) ?? '—'}`
    )
  );

  if (variance.ready_to_close) {
    const actions = el('div', 'task-row__actions');
    const closeBtn = el('button', 'btn btn--primary', 'Close project');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => {
      showCloseConfirm(confirmHost, project, variance.slip_days, onDone);
    });
    actions.append(closeBtn);
    row.append(actions);
  }
  return row;
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
  const reason = el('input', 'sign-in__input') as HTMLInputElement;
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
}

export async function renderSearchView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren();
  const form = el('form', 'search-form');
  const input = el('input', 'sign-in__input') as HTMLInputElement;
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
  canvas.append(form, results);
}

function paintSearch(host: HTMLElement, tasks: Task[], projects: Project[]): void {
  host.replaceChildren();
  if (!tasks.length && !projects.length) {
    host.append(el('p', 'empty-state', 'No matches.'));
    return;
  }
  for (const project of projects) {
    const row = el('article', 'task-row');
    row.append(el('h3', 'task-row__title', project.title), el('span', 'chip', 'project'));
    host.append(row);
  }
  for (const task of tasks) {
    host.append(renderTaskRow(task, async () => undefined));
  }
}

export async function renderTemplatesView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const data = await tasksApi.listTemplates();
  canvas.replaceChildren();
  canvas.append(el('p', 'view-lede', 'Start from a template, or save any task/project as one from its row later.'));

  canvas.append(el('h2', 'section-title', 'Task templates'));
  const taskStack = el('div', 'task-stack');
  for (const tt of data.task_templates as TaskTemplate[]) {
    const row = el('article', 'task-row');
    const actions = el('div', 'task-row__actions');
    const use = el('button', 'btn btn--primary', 'Use');
    use.type = 'button';
    use.addEventListener('click', async () => {
      await tasksApi.createTaskFromTemplate(tt.id);
      location.hash = '#/day';
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
    row.append(el('h3', 'task-row__title', pt.name), el('span', 'chip', pt.type));
    projStack.append(row);
  }
  for (const et of data.excursion_templates as ExcursionTemplate[]) {
    const row = el('article', 'task-row');
    row.append(
      el('h3', 'task-row__title', et.name),
      el('span', 'chip', 'excursion'),
      el('p', 'task-row__desc', et.checklist_items.join(' · '))
    );
    projStack.append(row);
  }
  canvas.append(projStack);
}

function renderQuickAdd(onCreated: () => void): HTMLElement {
  const form = el('form', 'quick-add');
  const title = el('input', 'sign-in__input') as HTMLInputElement;
  title.placeholder = 'New task title';
  title.required = true;
  const domain = el('select', 'quick-add__select') as HTMLSelectElement;
  for (const d of ['teaching', 'life', 'wedding', 'health', 'other'] as const) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    domain.append(opt);
  }
  const submit = el('button', 'btn btn--primary', 'Add');
  submit.type = 'submit';
  form.append(title, domain, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await tasksApi.createTask({
        title: title.value.trim(),
        domain: domain.value,
        due_date: toDateKey(new Date())
      });
      title.value = '';
      onCreated();
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}
