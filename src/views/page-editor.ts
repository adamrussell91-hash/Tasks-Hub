import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { PageBlock } from '@/schemas/page-block';
import { tasksApi } from '@/services/client-api';
import {
  formatRelativeUpdated,
  projectProgress,
  statusBadgeClass,
  statusLabel
} from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { mountBlockCanvas, mountBlockPalette } from '@/builder/canvas';
import { renderQuickAdd } from '@/views/task-editor';

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

function domainChip(domain: string): HTMLElement {
  const chip = el('span', 'hub-chip', domain[0]!.toUpperCase() + domain.slice(1));
  chip.dataset.area = domain;
  return chip;
}

export type EntityPageRef = { kind: 'task' | 'project'; id: string };

function pageBlocksOf(entity: Task | Project): PageBlock[] {
  return Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
}

export async function renderPageEditor(canvas: HTMLElement, ref: EntityPageRef): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading page…'));
  try {
    if (ref.kind === 'task') {
      const [task, projects] = await Promise.all([tasksApi.getTask(ref.id), tasksApi.listProjects()]);
      if (!task) throw new Error('Task not found');
      paintTaskPage(canvas, task, projects);
      return;
    }
    const [project, tasks] = await Promise.all([tasksApi.getProject(ref.id), tasksApi.listTasks()]);
    if (!project) throw new Error('Project not found');
    paintProjectPage(canvas, project, tasks);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPageEditor(canvas, ref), 'Could not open page');
  }
}

function paintTaskPage(canvas: HTMLElement, task: Task, _projects: Project[]): void {
  let current = task;
  const page = el('div', 'page-editor');
  const layout = el('div', 'page-editor__layout');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(el('span', 'hub-card__eyebrow', 'Task'), el('span', statusBadgeClass(task.status), statusLabel(task.status)));
  const title = el('h1', 'hub-card__title', task.title);
  const tags = el('div', 'task-card__tags-row');
  const chips = el('div', 'hub-chips');
  chips.append(domainChip(task.domain));
  const priority = el('span', 'priority-chip', task.priority);
  priority.dataset.priority = task.priority;
  chips.append(priority);
  tags.append(chips);
  if (task.due_date) tags.append(el('span', 'date-badge', `Due ${formatDisplayDate(task.due_date)}`));
  if (task.description) card.append(head, title, tags, el('p', 'hub-card__meta', task.description));
  else card.append(head, title, tags);
  const canvasHost = el('div', 'block-canvas');
  card.append(canvasHost);
  card.append(
    el('footer', 'task-card__foot', undefined)
  );
  const foot = card.querySelector('.task-card__foot')!;
  foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(task.updated_at)));
  const back = el('button', 'btn btn--ghost', 'Back to Board');
  back.type = 'button';
  back.addEventListener('click', () => {
    location.hash = '#/board';
  });
  foot.append(back);

  let saveTimer: number | undefined;
  const handle = mountBlockCanvas(canvasHost, pageBlocksOf(current), (blocks) => {
    current = { ...current, page_blocks: blocks };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi.updateTask(current.id, { page_blocks: blocks }).catch((err) => {
        canvas.append(el('p', 'empty-state', errorMessage(err)));
      });
    }, 400);
  });
  const palette = mountBlockPalette((type) => handle.insertType(type));
  layout.append(palette, card);
  page.append(layout);
  canvas.replaceChildren(page);
}

function paintProjectPage(canvas: HTMLElement, project: Project, tasks: Task[]): void {
  let current = project;
  const progress = projectProgress(project, tasks);
  const page = el('div', 'page-editor');
  const layout = el('div', 'page-editor__layout');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(
    el('span', 'hub-card__eyebrow', project.type === 'excursion' ? 'Excursion' : 'Project'),
    el('span', statusBadgeClass(project.status), statusLabel(project.status))
  );
  const title = el('h1', 'hub-card__title', project.title);
  const tags = el('div', 'task-card__tags-row');
  tags.append(el('div', 'hub-chips'));
  tags.firstElementChild!.append(el('span', 'hub-chip', project.type));
  if (project.current_end_date) {
    tags.append(el('span', 'date-badge', `Target ${formatDisplayDate(project.current_end_date)}`));
  }
  const metrics = el('div', 'task-card__progress');
  const metric = el('div');
  const pct = el('p', 'hub-hero-metric');
  pct.innerHTML = `${progress.pct}<span class="hub-hero-metric__unit">%</span>`;
  metric.append(pct, el('p', 'hub-hero-metric__lab', `${progress.done} of ${progress.total} tasks complete`));
  metrics.append(metric);
  const track = el('div', 'hub-track');
  const fill = el('div', 'hub-track__fill');
  fill.style.width = `${progress.pct}%`;
  track.append(fill);
  if (project.arc_summary || project.description) {
    card.append(head, title, tags, el('p', 'hub-card__meta', project.arc_summary || project.description), metrics, track);
  } else {
    card.append(head, title, tags, metrics, track);
  }
  card.append(renderQuickAdd(() => void renderPageEditor(canvas, { kind: 'project', id: project.id }), project.id));
  const canvasHost = el('div', 'block-canvas');
  card.append(canvasHost);
  const foot = el('footer', 'task-card__foot');
  foot.append(el('span', 'hub-card__meta', formatRelativeUpdated(project.updated_at)));
  const back = el('button', 'btn btn--ghost', 'Back to Projects');
  back.type = 'button';
  back.addEventListener('click', () => {
    location.hash = '#/projects';
  });
  foot.append(back);
  card.append(foot);

  let saveTimer: number | undefined;
  const handle = mountBlockCanvas(canvasHost, pageBlocksOf(current), (blocks) => {
    current = { ...current, page_blocks: blocks };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi.updateProject(current.id, { page_blocks: blocks }).catch((err) => {
        canvas.append(el('p', 'empty-state', errorMessage(err)));
      });
    }, 400);
  });
  const palette = mountBlockPalette((type) => handle.insertType(type));
  layout.append(palette, card);
  page.append(layout);
  canvas.replaceChildren(page);
}
