import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { openTasks } from '@/domain/queries';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';

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

const COLUMNS: Array<{ id: BoardColumnId; title: string; empty: string; statuses: Task['status'][] }> = [
  { id: 'todo', title: 'To do', empty: 'Nothing waiting.', statuses: ['open', 'deferred'] },
  { id: 'in_progress', title: 'In progress', empty: 'Nothing in progress right now.', statuses: ['in_progress'] },
  { id: 'blocked', title: 'Blocked', empty: 'Nothing blocked.', statuses: [] },
  { id: 'done', title: 'Done', empty: 'Nothing done yet.', statuses: ['done'] }
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

function renderCard(
  task: Task,
  projects: Project[],
  editorHost: HTMLElement,
  onMove: (task: Task, status: Task['status']) => void,
  onDelete: (task: Task) => void,
  onReload: () => void
): HTMLElement {
  const card = el('article', 'board-card');
  card.dataset.domain = task.domain;
  card.dataset.status = task.status;
  const title = el('h3', 'board-card__title', task.title);
  title.tabIndex = 0;
  title.setAttribute('role', 'button');
  const openEdit = () => renderTaskEditor(editorHost, task, projects, onReload);
  title.addEventListener('click', openEdit);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEdit();
    }
  });
  card.append(title);
  const meta = el('div', 'board-card__meta');
  meta.append(el('span', 'chip', task.domain), el('span', 'chip chip--muted', task.priority));
  if (task.due_date) meta.append(el('span', 'chip chip--muted', formatDisplayDate(task.due_date)));
  if (task.depends_on.length) {
    meta.append(el('span', 'chip chip--muted', `${task.depends_on.length} deps`));
  }
  card.append(meta);

  const actions = el('div', 'board-card__actions');
  const edit = el('button', 'btn btn--ghost', 'Edit');
  edit.type = 'button';
  edit.addEventListener('click', openEdit);
  actions.append(edit);
  if (task.status !== 'in_progress' && task.status !== 'done') {
    const start = el('button', 'btn btn--secondary', 'Start');
    start.type = 'button';
    start.addEventListener('click', () => {
      start.disabled = true;
      start.textContent = 'Saving…';
      card.dataset.status = 'in_progress';
      onMove(task, 'in_progress');
    });
    actions.append(start);
  }
  if (task.status !== 'done') {
    const done = el('button', 'btn btn--primary', 'Done');
    done.type = 'button';
    done.addEventListener('click', () => {
      done.disabled = true;
      done.textContent = 'Saving…';
      card.dataset.status = 'done';
      onMove(task, 'done');
    });
    actions.append(done);
  } else {
    const reopen = el('button', 'btn btn--ghost', 'Reopen');
    reopen.type = 'button';
    reopen.addEventListener('click', () => {
      reopen.disabled = true;
      reopen.textContent = 'Saving…';
      card.dataset.status = 'open';
      onMove(task, 'open');
    });
    actions.append(reopen);
  }
  const remove = el('button', 'btn btn--ghost', 'Delete');
  remove.type = 'button';
  remove.addEventListener('click', () => onDelete(task));
  actions.append(remove);
  card.append(actions);
  return card;
}

/** Board is the Tasks Hub home surface — optional project scope for Kanban. */
export async function renderBoardView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading board…'));
  let tasks: Awaited<ReturnType<typeof tasksApi.listTasks>>;
  let projects: Awaited<ReturnType<typeof tasksApi.listProjects>>;
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    canvas.replaceChildren(
      el('p', 'empty-state', err instanceof Error ? err.message : 'Could not load board')
    );
    const retry = el('button', 'btn btn--secondary', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', () => void renderBoardView(canvas));
    canvas.append(retry);
    return;
  }
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
      `${openTasks(scoped).length} open in scope · ${projects.filter((p) => p.status === 'active').length} active projects · ${formatDisplayDate(new Date())}`
    )
  );

  const filterRow = el('div', 'board-filter');
  const scope = createHubFilter({
    key: 'Scope',
    label: 'Board project scope',
    defaultValue: 'all',
    options: [
      { value: 'all', label: 'All tasks' },
      ...projects.map((project) => ({ value: project.id, label: project.title }))
    ],
    value: boardProjectFilter,
    onChange: (value) => {
      boardProjectFilter = value as string | 'all';
      void renderBoardView(canvas);
    }
  });
  filterRow.append(scope.el);
  canvas.append(filterRow);

  const confirmHost = el('div', 'board-confirm');
  canvas.append(renderQuickAdd(() => void renderBoardView(canvas), boardProjectFilter === 'all' ? null : boardProjectFilter));
  canvas.append(confirmHost);

  const board = el('div', 'board-grid');
  for (const col of COLUMNS) {
    const section = el('section', 'board-col');
    section.append(el('h2', 'board-col__title', col.title));
    const stack = el('div', 'board-col__stack');
    const items = scoped.filter((t) => columnFor(t, byId) === col.id);
    if (!items.length) stack.append(el('p', 'empty-state empty-state--compact', col.empty));
    for (const task of items) {
      stack.append(
        renderCard(
          task,
          projects,
          confirmHost,
          async (t, status) => {
            try {
              await tasksApi.updateTask(t.id, { status });
              await renderBoardView(canvas);
            } catch (err) {
              canvas.prepend(
                el('p', 'empty-state', err instanceof Error ? err.message : 'Update failed')
              );
              await renderBoardView(canvas);
            }
          },
          (t) => {
            showConfirmWrite(
              confirmHost,
              `Delete “${t.title}”`,
              'This removes the task from the hub.',
              async () => {
                await tasksApi.deleteTask(t.id, {
                  agent: 'Tasks Hub',
                  reason: 'Board delete'
                });
                await renderBoardView(canvas);
              },
              'Delete'
            );
          },
          () => void renderBoardView(canvas)
        )
      );
    }
    section.append(stack);
    board.append(section);
  }
  canvas.append(board);
}

export type { Project };
