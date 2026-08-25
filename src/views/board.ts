import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { openTasks } from '@/domain/queries';
import { BOARD_COLUMNS, columnForTask, statusForColumn, type BoardColumnId } from '@/domain/board';
import { boardTasks, isBoardTask } from '@/domain/hierarchy';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { errorMessage, showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd, renderTaskEditor } from '@/views/task-editor';
import { initBoard, updateBoardCounts, type BoardMoveDetail } from '@/views/sprint-board';
import { mountTaskCard } from '@/views/hub-cards';

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

function appendBoardCard(
  list: HTMLElement,
  task: Task,
  projects: Project[],
  editorHost: HTMLElement,
  onDelete: (task: Task) => void,
  onReload: (task?: Task) => void
): HTMLElement {
  return mountTaskCard(
    list,
    task,
    {
      onEdit: (current) => void renderTaskEditor(editorHost, current, projects, onReload),
      onDelete
    },
    true
  );
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

function inScope(task: Task): boolean {
  if (task.status === 'dead' || !isBoardTask(task)) return false;
  return boardProjectFilter === 'all' || task.parent_project_id === boardProjectFilter;
}

function listForColumn(board: HTMLElement, column: BoardColumnId): HTMLElement | null {
  return board.querySelector(`.card-list[data-col="${column}"]`);
}

/** Board is the Tasks Hub home surface — sprint-board drag over hub tiles. */
export async function renderBoardView(canvas: HTMLElement): Promise<void> {
  teardownBoard?.();
  teardownBoard = null;
  if (!canvas.querySelector('.board')) {
    canvas.replaceChildren(el('p', 'canvas-status', 'Loading board…'));
  }
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

  function scoped(): Task[] {
    const eligible = boardTasks(tasks.filter((t) => t.status !== 'dead'));
    return boardProjectFilter === 'all'
      ? eligible
      : eligible.filter((t) => t.parent_project_id === boardProjectFilter);
  }

  canvas.replaceChildren();
  const lede = el(
    'p',
    'view-lede',
    `${openTasks(scoped()).length} open in scope · drag cards between columns, or focus one and press Space.`
  );
  canvas.append(lede);

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

  const board = el('div', 'board board-grid');
  board.setAttribute('aria-label', 'Task board');

  function syncChrome(): void {
    lede.textContent = `${openTasks(scoped()).length} open in scope · drag cards between columns, or focus one and press Space.`;
    updateBoardCounts(board);
  }

  function upsertTask(task: Task): void {
    const index = tasks.findIndex((entry) => entry.id === task.id);
    if (index >= 0) tasks[index] = task;
    else tasks.push(task);
    byId.set(task.id, task);
    const existing = board.querySelector<HTMLElement>(`[data-id="${task.id}"]`);
    if (!inScope(task)) {
      existing?.remove();
      syncChrome();
      return;
    }
    const column = columnForTask(task, byId);
    const list = listForColumn(board, column);
    if (!list) return;
    existing?.remove();
    const card = appendBoardCard(
      list,
      task,
      projects,
      confirmHost,
      (current) => removeTask(current),
      (updated) => {
        if (updated) upsertTask(updated);
        else void tasksApi.getTask(task.id).then(upsertTask);
        confirmHost.replaceChildren();
      }
    );
    card.dataset.col = column;
    const hint = list.querySelector('.empty-hint');
    if (hint) list.insertBefore(card, hint);
    syncChrome();
  }

  function removeTask(task: Task): void {
    showConfirmWrite(
      confirmHost,
      `Delete “${task.title}”`,
      'This removes the task from the hub.',
      async () => {
        const card = board.querySelector<HTMLElement>(`[data-id="${task.id}"]`);
        card?.remove();
        tasks = tasks.filter((entry) => entry.id !== task.id);
        byId.delete(task.id);
        syncChrome();
        try {
          await tasksApi.deleteTask(task.id, {
            agent: 'Tasks Hub',
            reason: 'Board delete'
          });
        } catch (err) {
          tasks.push(task);
          byId.set(task.id, task);
          upsertTask(task);
          throw err;
        }
      },
      'Delete'
    );
  }

  canvas.append(
    renderQuickAdd((created) => {
      upsertTask(created);
    }, boardProjectFilter === 'all' ? null : boardProjectFilter)
  );
  canvas.append(confirmHost);

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

    const items = scoped().filter((t) => columnForTask(t, byId) === col.id);
    for (const task of items) {
      const card = appendBoardCard(
        list,
        task,
        projects,
        confirmHost,
        (current) => removeTask(current),
        (updated) => {
          if (updated) upsertTask(updated);
          else void tasksApi.getTask(task.id).then(upsertTask);
          confirmHost.replaceChildren();
        }
      );
      card.dataset.col = col.id;
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
