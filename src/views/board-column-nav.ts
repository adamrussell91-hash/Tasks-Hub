import { BOARD_COLUMNS, type BoardColumnId } from '@/domain/board';
import { el } from '@/views/hub-kit';

/** Writable board columns — Blocked is derived from dependencies. */
export const BOARD_MOVE_COLUMNS = ['todo', 'doing', 'done'] as const;
export type BoardMoveColumnId = (typeof BOARD_MOVE_COLUMNS)[number];

export function isBoardMoveColumn(column: BoardColumnId): column is BoardMoveColumnId {
  return column === 'todo' || column === 'doing' || column === 'done';
}

export function renderBoardColumnNav(board: HTMLElement): HTMLElement {
  const nav = el('nav', 'board-col-nav');
  nav.setAttribute('aria-label', 'Board columns');
  const pills = el('div', 'hub-pills board-col-nav__pills');
  pills.setAttribute('role', 'tablist');
  for (const col of BOARD_COLUMNS) {
    const count =
      board.querySelector(`.column[data-col="${col.id}"] .column-count`)?.textContent?.trim() ?? '0';
    const btn = el(
      'button',
      'hub-pills__btn board-col-nav__btn',
      `${col.title} ${count}`
    );
    btn.type = 'button';
    btn.dataset.boardCol = col.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-controls', `board-col-${col.id}`);
    pills.append(btn);
  }
  nav.append(pills);
  return nav;
}

export function syncBoardColumnNavCounts(nav: HTMLElement, board: HTMLElement): void {
  for (const btn of nav.querySelectorAll<HTMLButtonElement>('[data-board-col]')) {
    const colId = btn.dataset.boardCol;
    if (!colId) continue;
    const col = BOARD_COLUMNS.find((entry) => entry.id === colId);
    const count =
      board.querySelector(`.column[data-col="${colId}"] .column-count`)?.textContent?.trim() ?? '0';
    btn.textContent = col ? `${col.title} ${count}` : count;
  }
}

/** Mobile column tabs — scroll the snap board and mirror the visible column. */
export function initBoardColumnNav(board: HTMLElement, nav: HTMLElement): () => void {
  const buttons = [...nav.querySelectorAll<HTMLButtonElement>('[data-board-col]')];
  let activeCol = buttons[0]?.dataset.boardCol ?? 'todo';

  function setActive(colId: string, force = false): void {
    if (!force && activeCol === colId) return;
    activeCol = colId;
    for (const btn of buttons) {
      const selected = btn.dataset.boardCol === colId;
      btn.classList.toggle('is-active', selected);
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
  }

  function scrollToColumn(colId: string): void {
    const col = board.querySelector<HTMLElement>(`.column[data-col="${colId}"]`);
    if (!col) return;
    col.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActive(colId);
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const colId = btn.dataset.boardCol;
      if (colId) scrollToColumn(colId);
    });
  }

  const columns = [...board.querySelectorAll<HTMLElement>('.column')];
  const ratios = new Map<string, number>();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const colId = (entry.target as HTMLElement).dataset.col;
        if (!colId) continue;
        ratios.set(colId, entry.intersectionRatio);
      }
      let bestCol = activeCol;
      let bestRatio = 0;
      for (const [colId, ratio] of ratios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestCol = colId;
        }
      }
      if (bestRatio > 0) setActive(bestCol);
    },
    { root: board, threshold: [0, 0.25, 0.5, 0.75, 1] }
  );

  for (const col of columns) {
    col.id = `board-col-${col.dataset.col ?? ''}`;
    observer.observe(col);
  }

  setActive(activeCol, true);

  return () => observer.disconnect();
}
