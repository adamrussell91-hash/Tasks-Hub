import type { Task, TaskDomain, TaskPriority, TaskStatus } from '@/schemas/task';
import type { Project, ProjectStatus } from '@/schemas/project';
import type { Block } from '@/schemas/block';
import { nextBlockIdFactory } from '@/teacher/lesson-canvas/drop';
import { mountBlockCanvas, type BlockCanvasHandle } from '@/teacher/lesson-canvas/mount-page';
import { tasksApi } from '@/services/client-api';
import { formatRelativeUpdated, projectProgress, statusLabel } from '@/domain/cards';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { renderQuickAdd } from '@/views/task-editor';
import { mountBlockInsert } from '@/views/block-insert';

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

const TASK_STATUSES: TaskStatus[] = ['open', 'in_progress', 'done', 'deferred', 'dead'];
const PROJECT_STATUSES: ProjectStatus[] = ['active', 'stalled', 'revived', 'archived_dead'];
const DOMAINS: TaskDomain[] = ['teaching', 'life', 'wedding', 'health', 'other'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export type EntityPageRef = { kind: 'task' | 'project'; id: string };

function pageBlocksOf(entity: Task | Project): Block[] {
  return Array.isArray(entity.page_blocks) ? entity.page_blocks : [];
}

function selectControl(
  className: string,
  label: string,
  values: readonly string[],
  selected: string,
  labels?: (value: string) => string
): HTMLSelectElement {
  const select = el('select', `hub-filter ${className}`) as HTMLSelectElement;
  select.setAttribute('aria-label', label);
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = labels ? labels(value) : value;
    if (value === selected) opt.selected = true;
    select.append(opt);
  }
  return select;
}

function titleInput(value: string, label: string): HTMLInputElement {
  const input = el('input', 'hub-card__title page-card__title-input') as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function backLink(href: string, label: string): HTMLAnchorElement {
  const link = el('a', 'page-card__back', label) as HTMLAnchorElement;
  link.href = href;
  return link;
}

function mountEngine(
  layout: HTMLElement,
  canvasHost: HTMLElement,
  blocks: Block[],
  onChange: (blocks: Block[]) => void
): BlockCanvasHandle {
  const handle = mountBlockCanvas(canvasHost, {
    blocks,
    idFactory: nextBlockIdFactory('block', blocks),
    onChange
  });

  const add = el('div', 'page-editor__add');
  mountBlockInsert(add, {
    onInsert: (type) => handle.insertType(type)
  });
  layout.append(add, canvasHost);
  return handle;
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

function paintTaskPage(canvas: HTMLElement, task: Task, projects: Project[]): void {
  let current = task;
  let saveTimer: number | undefined;
  const errorHost = el('p', 'empty-state');
  errorHost.hidden = true;
  const updated = el('span', 'hub-card__meta', formatRelativeUpdated(task.updated_at));

  const persist = (patch: Partial<Task>) => {
    current = { ...current, ...patch };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi
        .updateTask(current.id, {
          title: current.title,
          description: current.description,
          domain: current.domain,
          priority: current.priority,
          status: current.status,
          due_date: current.due_date,
          parent_project_id: current.parent_project_id,
          page_blocks: current.page_blocks
        })
        .then(
          (next) => {
            current = { ...current, ...next };
            updated.textContent = formatRelativeUpdated(next.updated_at);
            errorHost.hidden = true;
            errorHost.textContent = '';
          },
          (err) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          }
        );
    }, 400);
  };

  const page = el('div', 'page-editor');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(el('span', 'hub-card__eyebrow', 'Task'), backLink('#/board', '← Board'));

  const title = titleInput(task.title, 'Task title');
  title.addEventListener('input', () => {
    const next = title.value.trim();
    if (!next) return;
    persist({ title: next });
  });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) title.value = current.title;
  });

  const fields = el('div', 'page-card__fields');
  const status = selectControl('page-card__status', 'Status', TASK_STATUSES, task.status, statusLabel);
  status.addEventListener('change', () => persist({ status: status.value as TaskStatus }));

  const domain = selectControl('page-card__domain', 'Domain', DOMAINS, task.domain);
  domain.addEventListener('change', () => persist({ domain: domain.value as TaskDomain }));

  const priority = selectControl('page-card__priority', 'Priority', PRIORITIES, task.priority);
  priority.addEventListener('change', () => persist({ priority: priority.value as TaskPriority }));

  const due = el('input', 'hub-search page-card__due') as HTMLInputElement;
  due.type = 'date';
  due.value = task.due_date ?? '';
  due.setAttribute('aria-label', 'Due date');
  due.addEventListener('change', () => persist({ due_date: due.value || null }));

  const project = selectControl(
    'page-card__project',
    'Project',
    ['', ...projects.filter((item) => item.status !== 'archived_dead').map((item) => item.id)],
    task.parent_project_id ?? '',
    (value) => {
      if (!value) return 'No project';
      return projects.find((item) => item.id === value)?.title ?? value;
    }
  );
  project.addEventListener('change', () => persist({ parent_project_id: project.value || null }));

  fields.append(status, domain, priority, due, project);

  const notes = document.createElement('textarea');
  notes.className = 'hub-search task-editor__notes page-card__notes';
  notes.value = task.description;
  notes.rows = 3;
  notes.setAttribute('aria-label', 'Notes');
  notes.addEventListener('input', () => persist({ description: notes.value }));

  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(head, title, fields, notes, foot);

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  mountEngine(layout, canvasHost, pageBlocksOf(current), (blocks) => persist({ page_blocks: blocks }));

  page.append(card, errorHost, layout);
  canvas.replaceChildren(page);
}

function paintProjectPage(canvas: HTMLElement, project: Project, tasks: Task[]): void {
  let current = project;
  let saveTimer: number | undefined;
  const errorHost = el('p', 'empty-state');
  errorHost.hidden = true;
  const updated = el('span', 'hub-card__meta', formatRelativeUpdated(project.updated_at));

  const persist = (patch: Partial<Project>) => {
    current = { ...current, ...patch };
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      void tasksApi
        .updateProject(current.id, {
          title: current.title,
          description: current.description,
          arc_summary: current.arc_summary,
          status: current.status,
          current_end_date: current.current_end_date,
          page_blocks: current.page_blocks
        })
        .then(
          (next) => {
            current = { ...current, ...next };
            updated.textContent = formatRelativeUpdated(next.updated_at);
            errorHost.hidden = true;
            errorHost.textContent = '';
          },
          (err) => {
            errorHost.hidden = false;
            errorHost.textContent = errorMessage(err);
          }
        );
    }, 400);
  };

  const progress = projectProgress(project, tasks);
  const page = el('div', 'page-editor');
  const card = el('article', 'hub-card page-card');
  const head = el('header', 'task-card__head');
  head.append(
    el('span', 'hub-card__eyebrow', project.type === 'excursion' ? 'Excursion' : 'Project'),
    backLink('#/projects', 'Projects')
  );

  const title = titleInput(project.title, 'Project title');
  title.addEventListener('input', () => {
    const next = title.value.trim();
    if (!next) return;
    persist({ title: next });
  });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) title.value = current.title;
  });

  const fields = el('div', 'page-card__fields');
  const status = selectControl(
    'page-card__status',
    'Status',
    PROJECT_STATUSES,
    project.status,
    statusLabel
  );
  status.addEventListener('change', () => persist({ status: status.value as ProjectStatus }));

  const due = el('input', 'hub-search page-card__due') as HTMLInputElement;
  due.type = 'date';
  due.value = project.current_end_date ?? '';
  due.setAttribute('aria-label', 'Target date');
  due.addEventListener('change', () => persist({ current_end_date: due.value || null }));
  fields.append(status, due);

  const notes = document.createElement('textarea');
  notes.className = 'hub-search task-editor__notes page-card__notes';
  notes.value = project.arc_summary || project.description;
  notes.rows = 3;
  notes.setAttribute('aria-label', 'Summary');
  notes.addEventListener('input', () => persist({ arc_summary: notes.value, description: notes.value }));

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

  const foot = el('footer', 'task-card__foot');
  foot.append(updated);

  card.append(head, title, fields, notes, metrics, track);
  card.append(renderQuickAdd(() => void renderPageEditor(canvas, { kind: 'project', id: project.id }), project.id));
  card.append(foot);

  const canvasHost = el('div', 'block-canvas');
  const layout = el('div', 'page-editor__layout');
  mountEngine(layout, canvasHost, pageBlocksOf(current), (blocks) => persist({ page_blocks: blocks }));

  page.append(card, errorHost, layout);
  canvas.replaceChildren(page);
}
