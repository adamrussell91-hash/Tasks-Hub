import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { openTasks, toDateKey } from '@/domain/queries';

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

type BoardColumnId = 'todo' | 'in_progress' | 'blocked' | 'done';

const COLUMNS: Array<{ id: BoardColumnId; title: string; statuses: Task['status'][] }> = [
  { id: 'todo', title: 'To do', statuses: ['open', 'deferred'] },
  { id: 'in_progress', title: 'In progress', statuses: ['in_progress'] },
  { id: 'blocked', title: 'Blocked', statuses: [] },
  { id: 'done', title: 'Done', statuses: ['done'] }
];

/** Session-scoped project filter for Kanban (spec: project-scoped board). */
let boardProjectFilter: string | 'all' = 'all';

function isBlocked(task: Task, byId: Map<string, Task>): boolean {
  if (task.status === 'done' || task.status === 'dead') return false;
  return task.depends_on.some((id) => {
    const dep = byId.get(id);
    return !dep || dep.status !== 'done';
  });
}

function columnFor(task: Task, byId: Map<string, Task>): BoardColumnId {
  if (task.status === 'done' || task.status === 'dead') return 'done';
  if (isBlocked(task, byId)) return 'blocked';
  if (task.status === 'in_progress') return 'in_progress';
  return 'todo';
}

function renderCard(task: Task, onMove: (task: Task, status: Task['status']) => void): HTMLElement {
  const card = el('article', 'board-card');
  card.dataset.domain = task.domain;
  card.append(el('h3', 'board-card__title', task.title));
  const meta = el('div', 'board-card__meta');
  meta.append(el('span', 'chip', task.domain), el('span', 'chip chip--muted', task.priority));
  if (task.due_date) meta.append(el('span', 'chip chip--muted', task.due_date.slice(0, 10)));
  if (task.depends_on.length) {
    meta.append(el('span', 'chip chip--muted', `${task.depends_on.length} deps`));
  }
  card.append(meta);

  const actions = el('div', 'board-card__actions');
  if (task.status !== 'in_progress' && task.status !== 'done') {
    const start = el('button', 'btn btn--secondary', 'Start');
    start.type = 'button';
    start.addEventListener('click', () => onMove(task, 'in_progress'));
    actions.append(start);
  }
  if (task.status !== 'done') {
    const done = el('button', 'btn btn--primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => onMove(task, 'done'));
    actions.append(done);
  } else {
    const reopen = el('button', 'btn btn--ghost', 'Reopen');
    reopen.type = 'button';
    reopen.addEventListener('click', () => onMove(task, 'open'));
    actions.append(reopen);
  }
  card.append(actions);
  return card;
}

/** Board is the Tasks Hub home surface — optional project scope for Kanban. */
export async function renderBoardView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading board…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const scoped =
    boardProjectFilter === 'all'
      ? tasks.filter((t) => t.status !== 'dead')
      : tasks.filter((t) => t.status !== 'dead' && t.parent_project_id === boardProjectFilter);

  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      `Board · ${openTasks(scoped).length} open in scope · ${projects.filter((p) => p.status === 'active').length} active projects · ${toDateKey(new Date())}`
    )
  );

  const filterRow = el('div', 'board-filter');
  filterRow.append(el('span', 'chip chip--muted', 'Scope'));
  const select = el('select', 'quick-add__select') as HTMLSelectElement;
  select.setAttribute('aria-label', 'Board project scope');
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All tasks';
  select.append(allOpt);
  for (const project of projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.title;
    select.append(opt);
  }
  select.value = boardProjectFilter;
  select.addEventListener('change', () => {
    boardProjectFilter = select.value as string | 'all';
    void renderBoardView(canvas);
  });
  filterRow.append(select);
  canvas.append(filterRow);

  const form = renderQuickAdd(
    () => void renderBoardView(canvas),
    boardProjectFilter === 'all' ? null : boardProjectFilter
  );
  canvas.append(form);

  const board = el('div', 'board-grid');
  for (const col of COLUMNS) {
    const section = el('section', 'board-col');
    section.append(el('h2', 'board-col__title', col.title));
    const stack = el('div', 'board-col__stack');
    const items = scoped.filter((t) => columnFor(t, byId) === col.id);
    if (!items.length) stack.append(el('p', 'empty-state empty-state--compact', '—'));
    for (const task of items) {
      stack.append(
        renderCard(task, async (t, status) => {
          await tasksApi.updateTask(t.id, { status });
          await renderBoardView(canvas);
        })
      );
    }
    section.append(stack);
    board.append(section);
  }
  canvas.append(board);
}

function renderQuickAdd(onCreated: () => void, projectId: string | null): HTMLElement {
  const form = el('form', 'quick-add');
  const title = el('input', 'sign-in__input') as HTMLInputElement;
  title.placeholder = 'New task on the board';
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
        due_date: toDateKey(new Date()),
        parent_project_id: projectId
      });
      title.value = '';
      onCreated();
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

export type { Project };
