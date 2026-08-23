import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { openTasks } from '@/domain/queries';
import { BOARD_COLUMNS, columnForTask, statusForColumn, type BoardColumnId } from '@/domain/board';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage, showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { initBoard, type BoardMoveDetail } from '@/views/sprint-board';

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

/** Session-scoped project filter for Kanban (spec: project-scoped board). */
let boardProjectFilter: string | 'all' = 'all';
let teardownBoard: (() => void) | null = null;

function renderCard(
  task: Task,
  projects: Project[],
  editorHost: HTMLElement,
  onDelete: (task: Task) => void,
  onReload: () => void
): HTMLLIElement {
  const card = document.createElement('li');
  card.className = 'card board-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-roledescription', 'Draggable task card');
  card.dataset.id = task.id;
  card.dataset.col = '';
  card.dataset.domain = task.domain;
  card.dataset.status = task.status;

  const title = el('p', 'card-title board-card__title', task.title);
  card.append(title);

  const meta = el('div', 'card-meta board-card__meta');
  meta.append(el('span', 'chip', task.domain), el('span', 'chip chip--muted', task.priority));
  if (task.due_date) {
    const due = el('span', 'chip chip--muted card-date', formatDisplayDate(task.due_date));
    meta.append(due);
  }
  if (task.depends_on.length) {
    meta.append(el('span', 'chip chip--muted', `${task.depends_on.length} deps`));
  }
  card.append(meta);

  const actions = el('div', 'board-card__actions');
  const edit = el('button', 'btn btn--ghost', 'Edit');
  edit.type = 'button';
  const openEdit = () => renderTaskEditor(editorHost, task, projects, onReload);
  edit.addEventListener('click', openEdit);
  card.addEventListener('dblclick', (event) => {
    if (isInteractiveTarget(event.target)) return;
    openEdit();
  });
  actions.append(edit);
  const remove = el('button', 'btn btn--ghost', 'Delete');
  remove.type = 'button';
  remove.addEventListener('click', () => onDelete(task));
  actions.append(remove);
  card.append(actions);
  return card;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'));
}

function persistMove(
  detail: BoardMoveDetail,
  byId: Map<string, Task>,
  errorHost: HTMLElement,
  onReload: () => void
): void {
  const task = byId.get(detail.id);
  if (!task) return;
  const column = detail.column as BoardColumnId;
  const status = statusForColumn(column);
  if (!status || status === task.status) return;
  void tasksApi.updateTask(task.id, { status }).then(
    (updated) => {
      byId.set(updated.id, updated);
    },
    (err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not save the move')));
      onReload();
    }
  );
}

/** Board is the Tasks Hub home surface — sprint-board drag over hub tiles. */
export async function renderBoardView(canvas: HTMLElement): Promise<void> {
  teardownBoard?.();
  teardownBoard = null;
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
      `${openTasks(scoped).length} open in scope · drag cards between columns, or focus one and press Space.`
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
  canvas.append(
    renderQuickAdd(() => void renderBoardView(canvas), boardProjectFilter === 'all' ? null : boardProjectFilter)
  );
  canvas.append(confirmHost);

  const board = el('div', 'board board-grid');
  board.setAttribute('aria-label', 'Task board');

  for (const col of BOARD_COLUMNS) {
    const section = el('section', 'column board-col');
    section.dataset.col = col.id;
    section.setAttribute('aria-label', col.title);

    const header = el('header', 'column-header');
    const titleRow = el('div', 'column-title-row');
    titleRow.append(el('span', 'column-rail'), el('h2', 'column-title board-col__title', col.title));
    header.append(titleRow, el('span', 'column-count', '00'));
    section.append(header);

    const body = el('div', 'column-body');
    const list = document.createElement('ul');
    list.className = 'card-list board-col__stack';
    list.dataset.col = col.id;

    const items = scoped.filter((t) => columnForTask(t, byId) === col.id);
    for (const task of items) {
      const card = renderCard(
        task,
        projects,
        confirmHost,
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
      );
      card.dataset.col = col.id;
      list.append(card);
    }
    const hint = el('li', 'empty-hint', col.empty);
    hint.hidden = items.length > 0;
    list.append(hint);
    body.append(list);
    section.append(body);
    board.append(section);
  }

  canvas.append(board);
  teardownBoard = initBoard(board, {
    onCardMoved: (detail) => persistMove(detail, byId, confirmHost, () => void renderBoardView(canvas))
  });
}

export type { Project };
