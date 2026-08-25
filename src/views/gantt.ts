import type { Task } from '@/schemas/task';
import type { Project, Milestone } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import {
  GANTT_BAR_HEIGHT,
  GANTT_GROUP_HEADER_HEIGHT,
  GANTT_ROW_HEIGHT,
  barAtPoint,
  buildScopedGanttRows,
  cascadeForward,
  collectDependencies,
  criticalPath,
  dropTargetAt,
  moonPatchFromDrop,
  formatGanttTick,
  layoutGanttGroups,
  linksPatchForTask,
  mergeCriticalAcrossGroups,
  moonsForTray,
  placeholderGanttLayout,
  resizeEstimatedMinutes,
  shiftDueDate,
  wouldCreateCycle,
  type GanttBarLayout,
  type GanttDependency,
  type GanttDropTarget,
  type GanttEdgeLayout,
  type GanttLayout,
  type GanttScope,
  type GanttSchedulable,
  type GanttZoom
} from '@/domain/gantt';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { parseDue } from '@/domain/queries';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { renderTaskMicroCard } from '@/views/hub-cards';
import { renderTaskEditor } from '@/views/task-editor';
import { errorMessage, renderLoadError } from '@/views/feedback';

const STATUS_DOT: Record<string, string> = {
  open: 'var(--shallow)',
  in_progress: 'var(--wave)',
  done: 'var(--success)',
  deferred: 'var(--pastel-lilac-ink)',
  dead: 'var(--muted)',
  missed: 'var(--danger)'
};

type GanttSession = {
  scope: GanttScope;
  projectId: string;
  zoom: GanttZoom;
  showCritical: boolean;
  railCollapsed: boolean;
  collapsedGroups: Set<string>;
  moonFilter: 'place' | 'all';
};

const session: GanttSession = {
  scope: 'project',
  projectId: '',
  zoom: 'week',
  showCritical: true,
  railCollapsed: false,
  collapsedGroups: new Set(),
  moonFilter: 'place'
};

export function resetGanttSession(): void {
  session.scope = 'project';
  session.projectId = '';
  session.zoom = 'week';
  session.showCritical = true;
  session.railCollapsed = false;
  session.collapsedGroups = new Set();
  session.moonFilter = 'place';
  draggingMoonId = null;
}

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

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function edgePathD(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox?.baseVal;
  const viewW = vb?.width || Number(svg.getAttribute('width')) || rect.width;
  const viewH = vb?.height || Number(svg.getAttribute('height')) || rect.height;
  const scaleX = viewW / (rect.width || 1);
  const scaleY = viewH / (rect.height || 1);
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function schedulables(tasks: Task[], projects: Project[]): GanttSchedulable[] {
  return [
    ...tasks.map((task) => ({
      id: task.id,
      kind: 'task' as const,
      due_date: task.due_date,
      estimated_duration: task.estimated_duration
    })),
    ...projects.flatMap((project) =>
      project.milestones.map((milestone) => ({
        id: milestone.id,
        kind: 'milestone' as const,
        due_date: milestone.due_date,
        estimated_duration: null
      }))
    )
  ];
}

function findMilestone(projects: Project[], id: string): { project: Project; milestone: Milestone } | null {
  for (const project of projects) {
    const milestone = project.milestones.find((item) => item.id === id);
    if (milestone) return { project, milestone };
  }
  return null;
}

function taskById(tasks: Task[], id: string): Task | undefined {
  return tasks.find((task) => task.id === id);
}

function titleFor(id: string, tasks: Task[], projects: Project[]): string {
  const task = taskById(tasks, id);
  if (task) return task.title;
  const found = findMilestone(projects, id);
  return found?.milestone.title ?? id;
}

function pill(
  label: string,
  pressed: boolean,
  onClick: () => void,
  extraClass = ''
): HTMLButtonElement {
  const btn = el('button', `hub-pills__btn${pressed ? ' is-active' : ''}${extraClass ? ` ${extraClass}` : ''}`, label);
  btn.type = 'button';
  btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  btn.addEventListener('click', onClick);
  return btn;
}

let draggingMoonId: string | null = null;

function transferTaskId(event: DragEvent): string {
  return (
    event.dataTransfer?.getData('text/task-id') ||
    event.dataTransfer?.getData('text/plain') ||
    draggingMoonId ||
    ''
  );
}

function wireDrop(
  node: HTMLElement,
  onDrop: (taskId: string, event: DragEvent) => void
): void {
  node.addEventListener('dragover', (event) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    node.classList.add('is-drop-target');
  });
  node.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
    node.classList.remove('is-drop-target');
  });
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    node.classList.remove('is-drop-target');
    const taskId = transferTaskId(event);
    if (taskId) onDrop(taskId, event);
  });
}

export async function renderGanttView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading Gantt…'));
  let tasks: Task[];
  let projects: Project[];
  try {
    [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderGanttView(canvas), 'Could not load Gantt');
    return;
  }

  const liveProjects = projects.filter((project) => project.status !== 'archived_dead');
  const queryProject = hashQuery().get('project');
  if (queryProject && liveProjects.some((project) => project.id === queryProject)) {
    session.scope = 'project';
    session.projectId = queryProject;
  } else if (!session.projectId || !liveProjects.some((project) => project.id === session.projectId)) {
    const dated = liveProjects.find((project) => buildScopedGanttRows([project], tasks, 'project', project.id).length);
    session.projectId = dated?.id ?? liveProjects[0]?.id ?? '';
  }

  let previewId: string | null = null;
  let activeLayout: GanttLayout | null = null;
  let activePopover: HTMLElement | null = null;
  let lastChartTarget: GanttDropTarget | null = null;
  let toastTimer = 0;

  const toast = el('p', 'gantt-toast');
  toast.hidden = true;

  function flash(message: string): void {
    toast.hidden = false;
    toast.textContent = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2400);
  }

  const toolbar = el('div', 'gantt-toolbar');
  const left = el('div', 'gantt-toolbar__group');
  const right = el('div', 'gantt-toolbar__group');

  const scopePills = el('div', 'hub-pills');
  scopePills.setAttribute('role', 'group');
  scopePills.setAttribute('aria-label', 'Scope');
  function paintScopePills(): void {
    scopePills.replaceChildren(
      pill('This project', session.scope === 'project', () => {
        session.scope = 'project';
        paintScopePills();
        projectFilter.el.toggleAttribute('disabled', false);
        paint();
      }),
      pill('All projects', session.scope === 'all', () => {
        session.scope = 'all';
        paintScopePills();
        projectFilter.el.toggleAttribute('disabled', true);
        paint();
      })
    );
  }

  const projectFilter = createHubFilter({
    key: 'Project',
    label: 'Project',
    defaultValue: session.projectId,
    options: liveProjects.map((project) => ({
      value: project.id,
      label: `${project.title} (${project.type})`
    })),
    value: session.projectId,
    onChange: (value) => {
      session.projectId = value;
      session.scope = 'project';
      paintScopePills();
      projectFilter.el.toggleAttribute('disabled', false);
      paint();
    }
  });

  const zoomPills = el('div', 'hub-pills');
  zoomPills.setAttribute('role', 'group');
  zoomPills.setAttribute('aria-label', 'Zoom');
  function paintZoomPills(): void {
    zoomPills.replaceChildren(
      ...(['week', 'month', 'term'] as const).map((zoom) =>
        pill(zoom[0]!.toUpperCase() + zoom.slice(1), session.zoom === zoom, () => {
          session.zoom = zoom;
          paintZoomPills();
          paint();
        })
      )
    );
  }

  const criticalBtn = pill('Critical path', session.showCritical, () => {
    session.showCritical = !session.showCritical;
    criticalBtn.classList.toggle('is-active', session.showCritical);
    criticalBtn.setAttribute('aria-pressed', String(session.showCritical));
    paint();
  }, 'hub-pills__btn--critical');

  paintScopePills();
  paintZoomPills();
  left.append(scopePills, projectFilter.el);
  right.append(zoomPills, criticalBtn);
  toolbar.append(left, right);
  projectFilter.el.toggleAttribute('disabled', session.scope === 'all');

  const legend = el('div', 'gantt-legend');
  legend.append(
    el('span', 'chip chip--domain', 'moon / task'),
    el('span', 'chip chip--muted', '◆ milestone'),
    el('span', 'chip chip--muted', 'curve = depends on (FS solid · SS short-dash · FF long-dash)'),
    el('span', 'chip chip--critical', 'outline = critical path'),
    el('span', 'chip chip--muted', 'drop a card to place · drag a bar to move · right edge to resize · ○ to link')
  );

  const moons = el('section', 'gantt-moons');
  const side = el('div', 'gantt-side');
  const host = el('div', 'gantt-host');
  const rail = el('div', 'gantt-rail');
  const scroll = el('div', 'gantt-scroll');
  const preview = el('aside', 'graph-preview');
  preview.hidden = true;
  host.append(rail, scroll);
  side.append(host, preview);

  const fallback = el('table', 'viz-alt viz-alt--table');
  fallback.setAttribute('aria-label', 'Gantt rows, accessible fallback');
  const fallbackBody = el('tbody');
  fallback.append(fallbackBody);

  canvas.replaceChildren(toast, toolbar, legend, moons, side, fallback);

  async function persistTask(id: string, patch: Partial<Task>): Promise<Task | null> {
    try {
      const updated = await tasksApi.updateTask(id, patch);
      tasks = tasks.map((task) => (task.id === id ? updated : task));
      return updated;
    } catch (err) {
      flash(errorMessage(err, 'Could not save that change.'));
      return null;
    }
  }

  async function persistProject(id: string, patch: Partial<Project>): Promise<Project | null> {
    try {
      const updated = await tasksApi.updateProject(id, patch);
      projects = projects.map((project) => (project.id === id ? updated : project));
      return updated;
    } catch (err) {
      flash(errorMessage(err, 'Could not save that change.'));
      return null;
    }
  }

  async function persistCascade(changedId: string): Promise<void> {
    const shifted = cascadeForward(schedulables(tasks, projects), collectDependencies(tasks, projects), changedId);
    for (const [id, due] of shifted) {
      if (taskById(tasks, id)) await persistTask(id, { due_date: due });
      else {
        const found = findMilestone(projects, id);
        if (!found) continue;
        await persistProject(found.project.id, {
          milestones: found.project.milestones.map((milestone) =>
            milestone.id === id ? { ...milestone, due_date: due } : milestone
          )
        });
      }
    }
  }

  function closePopover(): void {
    activePopover?.remove();
    activePopover = null;
  }

  function closePreview(): void {
    preview.hidden = true;
    preview.replaceChildren();
    side.classList.remove('has-preview');
    previewId = null;
  }

  function showPreview(id: string): void {
    const task = taskById(tasks, id);
    const milestoneHit = task ? null : findMilestone(projects, id);
    if (!task && !milestoneHit) return;
    previewId = id;
    preview.hidden = false;
    side.classList.add('has-preview');

    const closeBtn = el('button', 'graph-preview__close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    closeBtn.addEventListener('click', closePreview);

    if (task) {
      const parent = task.parent_task_id ? taskById(tasks, task.parent_task_id) : undefined;
      const project = task.parent_project_id
        ? liveProjects.find((item) => item.id === task.parent_project_id)
        : undefined;
      const deps = incomingFor(task.id);
      preview.replaceChildren(
        closeBtn,
        el('p', 'graph-preview__eyebrow', parent ? 'child moon' : 'moon / task'),
        el('h3', 'graph-preview__title', task.title)
      );
      const chips = el('div', 'graph-preview__chips');
      chips.append(el('span', 'chip chip--domain', task.domain));
      chips.append(el('span', `chip chip--priority-${task.priority}`, task.priority));
      if (task.due_date) chips.append(el('span', 'chip chip--muted', formatDisplayDate(task.due_date)));
      if (project) chips.append(el('span', 'chip chip--muted', project.title));
      if (parent) chips.append(el('span', 'chip chip--muted', `child of ${parent.title}`));
      if (deps.length) chips.append(el('span', 'chip chip--muted', `${deps.length} dep${deps.length === 1 ? '' : 's'}`));
      preview.append(chips);
      if (deps.length) {
        const box = el('div', 'graph-preview__deps');
        box.append(el('h4', undefined, 'Depends on'));
        for (const dep of deps) {
          const row = el('div', 'graph-preview__dep-row');
          row.append(el('span', undefined, titleFor(dep.fromId, tasks, projects)));
          row.append(
            el(
              'span',
              'chip chip--muted',
              `${dep.type}${dep.offsetDays ? ` ${dep.offsetDays > 0 ? '+' : ''}${dep.offsetDays}d` : ''}`
            )
          );
          box.append(row);
        }
        preview.append(box);
      }
      const actions = el('div', 'graph-preview__actions');
      const edit = el('button', 'btn btn--secondary', 'Edit');
      edit.type = 'button';
      edit.addEventListener('click', () => {
        void renderTaskEditor(preview, task, liveProjects, () => void renderGanttView(canvas));
      });
      const page = el('button', 'btn btn--ghost', 'Open page');
      page.type = 'button';
      page.addEventListener('click', () => {
        location.hash = `#/task/${task.id}`;
      });
      actions.append(edit, page);
      preview.append(actions);
      return;
    }

    const { milestone, project } = milestoneHit!;
    preview.replaceChildren(
      closeBtn,
      el('p', 'graph-preview__eyebrow', 'milestone'),
      el('h3', 'graph-preview__title', milestone.title)
    );
    const chips = el('div', 'graph-preview__chips');
    chips.append(el('span', 'chip chip--muted', project.title));
    if (milestone.due_date) chips.append(el('span', 'chip chip--muted', formatDisplayDate(milestone.due_date)));
    preview.append(chips);
  }

  function incomingFor(id: string): GanttDependency[] {
    return collectDependencies(tasks, projects).filter((dep) => dep.toId === id);
  }

  function currentGroups() {
    return buildScopedGanttRows(liveProjects, tasks, session.scope, session.projectId || null);
  }

  function currentLayout(): GanttLayout {
    const groups = currentGroups();
    return (
      layoutGanttGroups(groups, {
        zoom: session.zoom,
        collapsedGroups: session.collapsedGroups
      }) ?? placeholderGanttLayout(session.zoom)
    );
  }

  function paintMoons(): void {
    const head = el('div', 'gantt-moons__head');
    const titles = el('div');
    titles.append(el('h2', 'gantt-moons__title', 'Moons'));
    titles.append(
      el(
        'p',
        'gantt-moons__hint',
        'Every card is a moon. Drop it on the timeline, on a project planet, or onto another moon to nest it.'
      )
    );
    const filters = el('div', 'hub-pills');
    filters.append(
      pill('Need a place', session.moonFilter === 'place', () => {
        session.moonFilter = 'place';
        paintMoons();
      }),
      pill('All moons', session.moonFilter === 'all', () => {
        session.moonFilter = 'all';
        paintMoons();
      })
    );
    head.append(titles, filters);

    const planets = el('div', 'gantt-planets');
    planets.setAttribute('aria-label', 'Projects');
    for (const project of liveProjects) {
      const chip = el('button', 'gantt-planet');
      chip.type = 'button';
      chip.dataset.projectId = project.id;
      chip.setAttribute('aria-pressed', session.projectId === project.id && session.scope === 'project' ? 'true' : 'false');
      const dot = el('span', 'gantt-planet__dot');
      chip.append(dot, document.createTextNode(project.title));
      chip.addEventListener('click', () => {
        session.projectId = project.id;
        session.scope = 'project';
        paintScopePills();
        projectFilter.el.toggleAttribute('disabled', false);
        paint();
      });
      wireDrop(chip, (taskId) => {
        void placeMoon(taskId, { kind: 'project', projectId: project.id });
      });
      planets.append(chip);
    }

    const scroller = el('div', 'gantt-moons__scroller');
    const list = moonsForTray(tasks, session.moonFilter);
    if (!list.length) {
      scroller.append(el('p', 'empty-state empty-state--compact', 'Every open moon already has a date and a project.'));
    }
    for (const task of list) {
      const card = renderTaskMicroCard(task, {
        onEdit: (item) => {
          showPreview(item.id);
        }
      });
      card.draggable = true;
      card.dataset.taskId = task.id;
      card.setAttribute('aria-grabbed', 'false');
      card.addEventListener('dragstart', (event) => {
        draggingMoonId = task.id;
        event.dataTransfer?.setData('text/task-id', task.id);
        event.dataTransfer?.setData('text/plain', task.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        card.classList.add('is-dragging');
        card.setAttribute('aria-grabbed', 'true');
      });
      card.addEventListener('dragend', () => {
        draggingMoonId = null;
        lastChartTarget = null;
        card.classList.remove('is-dragging');
        card.setAttribute('aria-grabbed', 'false');
      });
      card.addEventListener('click', (event) => {
        if ((event.target as Element).closest('button')) return;
        showPreview(task.id);
      });
      wireDrop(card, (taskId) => {
        if (taskId === task.id) return;
        void placeMoon(taskId, { kind: 'parent', parentTaskId: task.id });
      });
      scroller.append(card);
    }

    moons.replaceChildren(head, planets, scroller);
  }

  type PlaceIntent =
    | { kind: 'project'; projectId: string }
    | { kind: 'parent'; parentTaskId: string }
    | { kind: 'chart'; target: GanttDropTarget };

  async function placeMoon(taskId: string, intent: PlaceIntent): Promise<void> {
    const task = taskById(tasks, taskId);
    if (!task) return;
    const patch: Partial<Task> = {};
    let note = '';

    if (intent.kind === 'project') {
      patch.parent_project_id = intent.projectId;
      patch.parent_task_id = task.parent_task_id;
      note = `Linked ${task.title} to that project.`;
    } else if (intent.kind === 'parent') {
      const parent = taskById(tasks, intent.parentTaskId);
      if (!parent) return;
      patch.parent_task_id = parent.id;
      patch.parent_project_id = parent.parent_project_id ?? task.parent_project_id;
      note = `${task.title} is now a child of ${parent.title}.`;
    } else {
      Object.assign(patch, moonPatchFromDrop(task, intent.target, session.projectId || null));
      const parent =
        patch.parent_task_id && patch.parent_task_id !== task.parent_task_id
          ? taskById(tasks, patch.parent_task_id)
          : undefined;
      note = parent
        ? `${task.title} nested under ${parent.title} and dated ${formatDisplayDate(intent.target.dateKey)}.`
        : `Placed ${task.title} on ${formatDisplayDate(intent.target.dateKey)}.`;
    }

    const updated = await persistTask(taskId, patch);
    if (!updated) return;
    flash(note);
    if (previewId === taskId) showPreview(taskId);
    paint();
  }

  async function moveItem(id: string, kind: 'task' | 'milestone', days: number): Promise<void> {
    if (!days) return;
    if (kind === 'task') {
      const task = taskById(tasks, id);
      if (!task) return;
      const next = shiftDueDate(task.due_date, days);
      if (!next) return;
      await persistTask(id, { due_date: next });
    } else {
      const found = findMilestone(projects, id);
      if (!found) return;
      const next = shiftDueDate(found.milestone.due_date, days);
      if (!next) return;
      await persistProject(found.project.id, {
        milestones: found.project.milestones.map((milestone) =>
          milestone.id === id ? { ...milestone, due_date: next } : milestone
        )
      });
    }
    await persistCascade(id);
    paint();
    if (previewId === id) showPreview(id);
  }

  async function resizeItem(id: string, days: number): Promise<void> {
    const task = taskById(tasks, id);
    if (!task || !days) return;
    const minutes = resizeEstimatedMinutes(
      { id, kind: 'task', due_date: task.due_date, estimated_duration: task.estimated_duration },
      days
    );
    if (minutes == null) return;
    await persistTask(id, { estimated_duration: minutes });
    await persistCascade(id);
    paint();
  }

  async function addLink(fromId: string, toId: string): Promise<void> {
    const deps = collectDependencies(tasks, projects);
    if (deps.some((dep) => dep.fromId === fromId && dep.toId === toId)) return;
    if (wouldCreateCycle(deps, fromId, toId)) {
      flash('That link would loop — moons cannot depend on themselves.');
      return;
    }
    const next: GanttDependency = { fromId, toId, type: 'FS', offsetDays: 0 };
    const all = [...deps, next];
    if (taskById(tasks, toId)) {
      await persistTask(toId, linksPatchForTask(toId, all));
    } else {
      const found = findMilestone(projects, toId);
      if (!found) return;
      await persistProject(found.project.id, {
        milestones: found.project.milestones.map((milestone) =>
          milestone.id === toId
            ? { ...milestone, depends_on: [...(milestone.depends_on ?? []), fromId] }
            : milestone
        )
      });
    }
    await persistCascade(fromId);
    flash('Linked. Drag the curve to change FS / SS / FF.');
    paint();
  }

  async function updateLink(edge: GanttEdgeLayout, type: GanttDependency['type'], offsetDays: number): Promise<void> {
    const deps = collectDependencies(tasks, projects).map((dep) =>
      dep.fromId === edge.fromId && dep.toId === edge.toId ? { ...dep, type, offsetDays } : dep
    );
    if (taskById(tasks, edge.toId)) {
      await persistTask(edge.toId, linksPatchForTask(edge.toId, deps));
    }
    await persistCascade(edge.fromId);
    paint();
  }

  async function deleteLink(edge: GanttEdgeLayout): Promise<void> {
    const deps = collectDependencies(tasks, projects).filter(
      (dep) => !(dep.fromId === edge.fromId && dep.toId === edge.toId)
    );
    if (taskById(tasks, edge.toId)) {
      await persistTask(edge.toId, linksPatchForTask(edge.toId, deps));
    } else {
      const found = findMilestone(projects, edge.toId);
      if (found) {
        await persistProject(found.project.id, {
          milestones: found.project.milestones.map((milestone) =>
            milestone.id === edge.toId
              ? { ...milestone, depends_on: (milestone.depends_on ?? []).filter((id) => id !== edge.fromId) }
              : milestone
          )
        });
      }
    }
    paint();
  }

  function openDepPopover(edge: GanttEdgeLayout, clientX: number, clientY: number): void {
    closePopover();
    const pop = el('div', 'gantt-popover');
    const hostRect = host.getBoundingClientRect();
    pop.style.left = `${Math.max(8, clientX - hostRect.left - 100)}px`;
    pop.style.top = `${clientY - hostRect.top + 12}px`;
    pop.append(el('h4', undefined, 'Dependency'));

    const typeRow = el('div', 'gantt-popover__row');
    typeRow.append(el('label', undefined, 'Type'));
    const select = document.createElement('select');
    for (const type of ['FS', 'SS', 'FF'] as const) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      select.append(option);
    }
    select.value = edge.type;
    typeRow.append(select);

    const offsetRow = el('div', 'gantt-popover__row');
    offsetRow.append(el('label', undefined, 'Offset (d)'));
    const offset = document.createElement('input');
    offset.type = 'number';
    offset.value = String(edge.offsetDays);
    offsetRow.append(offset);

    const actions = el('div', 'gantt-popover__actions');
    const del = el('button', 'btn btn--secondary', 'Delete link');
    del.type = 'button';
    del.addEventListener('click', () => {
      closePopover();
      void deleteLink(edge);
    });
    const apply = el('button', 'btn btn--secondary', 'Apply');
    apply.type = 'button';
    apply.addEventListener('click', () => {
      closePopover();
      void updateLink(edge, select.value as GanttDependency['type'], Number(offset.value) || 0);
    });
    actions.append(del, apply);
    pop.append(typeRow, offsetRow, actions);
    host.append(pop);
    activePopover = pop;
  }

  function paintRail(layout: GanttLayout, titles: Array<{ id: string; title: string }>): void {
    const toggle = el('button', 'gantt-rail__toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', session.railCollapsed ? 'Expand task list' : 'Collapse task list');
    toggle.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>';
    toggle.addEventListener('click', () => {
      session.railCollapsed = !session.railCollapsed;
      paint();
    });
    rail.classList.toggle('is-collapsed', session.railCollapsed);
    rail.replaceChildren(toggle);

    const items = [
      ...layout.groupBounds.map((group) => ({ type: 'group' as const, y: group.y, group })),
      ...layout.bars.map((bar) => ({ type: 'bar' as const, y: bar.y, bar }))
    ].sort((a, b) => a.y - b.y);

    for (const entry of items) {
      if (entry.type === 'group') {
        const row = el('div', 'gantt-rail__group');
        row.style.height = `${GANTT_GROUP_HEADER_HEIGHT}px`;
        const chevron = svgEl('svg', {
          class: `gantt-rail__group-chevron${entry.group.collapsed ? ' gantt-rail__group-chevron--collapsed' : ''}`,
          viewBox: '0 0 24 24',
          width: 12,
          height: 12,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 2
        });
        chevron.append(svgEl('path', { d: 'M6 9l6 6 6-6' }));
        row.append(chevron, el('span', 'gantt-rail__label', entry.group.title));
        row.addEventListener('click', () => {
          if (session.collapsedGroups.has(entry.group.pid)) session.collapsedGroups.delete(entry.group.pid);
          else session.collapsedGroups.add(entry.group.pid);
          paint();
        });
        rail.append(row);
      } else {
        const item = entry.bar.row;
        const row = el('div', 'gantt-rail__row');
        row.style.height = `${GANTT_ROW_HEIGHT}px`;
        row.style.paddingLeft = `${0.75 + item.depth * 0.75}rem`;
        const dot = el('span', 'gantt-rail__dot');
        dot.style.background =
          item.kind === 'milestone' ? 'var(--navy)' : STATUS_DOT[item.status] ?? 'var(--shallow)';
        row.append(dot, el('span', 'gantt-rail__label', `${item.kind === 'milestone' ? '◆ ' : ''}${item.label}`));
        row.addEventListener('click', () => showPreview(item.id));
        rail.append(row);
      }
    }
    void titles;
  }

  function paintFallback(layout: GanttLayout): void {
    fallbackBody.replaceChildren();
    for (const bar of layout.bars) {
      const tr = el('tr');
      tr.append(
        el('th', undefined, bar.row.label),
        el('td', undefined, bar.row.kind),
        el('td', undefined, bar.row.status),
        el('td', undefined, formatDisplayDate(bar.row.end))
      );
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.addEventListener('click', () => showPreview(bar.row.id));
      fallbackBody.append(tr);
    }
  }

  function startBarDrag(event: PointerEvent, bar: GanttBarLayout, mode: 'move' | 'resize', group: SVGGElement): void {
    event.stopPropagation();
    const svg = scroll.querySelector('svg');
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const scale = svg.viewBox.baseVal.width / svgRect.width;
    const edgeRefs = (activeLayout?.edges ?? [])
      .filter((edge) => edge.fromId === bar.row.id || edge.toId === bar.row.id)
      .map((edge) => ({
        edge,
        isFrom: edge.fromId === bar.row.id,
        els: svg.querySelectorAll(`[data-edge-key="${edge.key}"]`)
      }));
    const rectEl = group.querySelector('rect.gantt-bar');
    const clipRectEl = group.querySelector('clipPath rect');
    const resizeGripEl = group.querySelector('.gantt-resize-handle');
    const handleEl = group.querySelector('.gantt-handle');
    let liveDx = 0;
    let moved = false;
    const originWidth = bar.width;
    const dayWidth = activeLayout?.dayWidth ?? 42;

    const onMove = (moveEvent: PointerEvent) => {
      liveDx = (moveEvent.clientX - event.clientX) * scale;
      if (Math.abs(liveDx) > 3) moved = true;
      if (mode === 'move') {
        group.setAttribute('transform', `translate(${liveDx},${bar.y})`);
        for (const ref of edgeRefs) {
          const x1 = ref.edge.x1 + (ref.isFrom ? liveDx : 0);
          const x2 = ref.edge.x2 + (!ref.isFrom ? liveDx : 0);
          const d = edgePathD(x1, ref.edge.y1, x2, ref.edge.y2);
          ref.els.forEach((path) => path.setAttribute('d', d));
        }
      } else if (rectEl) {
        const newWidth = Math.max(dayWidth * 0.7, originWidth + liveDx);
        rectEl.setAttribute('width', String(newWidth));
        clipRectEl?.setAttribute('width', String(newWidth));
        resizeGripEl?.setAttribute('x', String(bar.x + newWidth - 6));
        handleEl?.setAttribute('cx', String(bar.x + newWidth));
      }
    };

    const onEnd = () => {
      window.removeEventListener('pointermove', onMove);
      const days = Math.round(liveDx / dayWidth);
      if (!moved) {
        showPreview(bar.row.id);
        return;
      }
      if (mode === 'move') void moveItem(bar.row.id, bar.row.kind, days);
      else void resizeItem(bar.row.id, days);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
  }

  function startLinkDrag(event: PointerEvent, bar: GanttBarLayout): void {
    event.stopPropagation();
    const svg = scroll.querySelector('svg');
    if (!svg || !activeLayout) return;
    const ghost = svgEl('line', {
      class: 'gantt-drag-link',
      x1: bar.x + (bar.width || 8),
      y1: bar.y + GANTT_ROW_HEIGHT / 2,
      x2: bar.x + (bar.width || 8),
      y2: bar.y + GANTT_ROW_HEIGHT / 2
    });
    svg.append(ghost);
    const onMove = (moveEvent: PointerEvent) => {
      const pt = clientToSvg(svg, moveEvent.clientX, moveEvent.clientY);
      ghost.setAttribute('x2', String(pt.x));
      ghost.setAttribute('y2', String(pt.y));
    };
    const onEnd = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      ghost.remove();
      const pt = clientToSvg(svg, upEvent.clientX, upEvent.clientY);
      const target = barAtPoint(activeLayout!, pt.x, pt.y);
      if (target && target.row.id !== bar.row.id) void addLink(bar.row.id, target.row.id);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
  }

  function paintChart(layout: GanttLayout): void {
    activeLayout = layout;
    closePopover();
    const groups = currentGroups();
    const critical = session.showCritical
      ? session.scope === 'project'
        ? criticalPath(layout.bars)
        : mergeCriticalAcrossGroups(
            layout.bars,
            groups.map((group) => group.project.id)
          )
      : { nodes: new Set<string>(), edges: new Set<string>() };

    const svg = svgEl('svg', {
      class: 'gantt-svg',
      width: layout.totalWidth,
      height: layout.totalHeight,
      viewBox: `0 0 ${layout.totalWidth} ${layout.totalHeight}`,
      role: 'img',
      'aria-label': 'Gantt chart'
    });

    for (const tick of layout.ticks) {
      const off = Math.round(
        (tick.date.getTime() - layout.rangeStart.getTime()) / (24 * 60 * 60 * 1000)
      );
      const x = layout.labelWidth + off * layout.dayWidth;
      svg.append(
        svgEl('line', {
          x1: x,
          y1: layout.axisHeight,
          x2: x,
          y2: layout.totalHeight,
          class: tick.major ? 'gantt-grid gantt-grid--major' : 'gantt-grid'
        })
      );
      const label = svgEl('text', { x: x + 4, y: 16, class: 'gantt-tick' });
      label.textContent = formatGanttTick(tick.date, session.zoom);
      svg.append(label);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOff = Math.round((today.getTime() - layout.rangeStart.getTime()) / (24 * 60 * 60 * 1000));
    if (todayOff >= 0 && todayOff < layout.dayCount) {
      const x = layout.labelWidth + todayOff * layout.dayWidth + layout.dayWidth / 2;
      svg.append(
        svgEl('line', {
          x1: x,
          y1: layout.axisHeight,
          x2: x,
          y2: layout.totalHeight,
          class: 'gantt-today'
        })
      );
    }

    for (const group of layout.groupBounds) {
      svg.append(
        svgEl('rect', {
          x: 0,
          y: group.y,
          width: layout.totalWidth,
          height: GANTT_GROUP_HEADER_HEIGHT,
          class: 'gantt-group-header'
        })
      );
    }

    for (const edge of layout.edges) {
      const isCritical = critical.edges.has(edge.key);
      const dimmed = session.showCritical && critical.nodes.size > 0 && !isCritical;
      const cls = ['gantt-edge'];
      if (edge.type === 'SS') cls.push('gantt-edge--ss');
      if (edge.type === 'FF') cls.push('gantt-edge--ff');
      if (isCritical) cls.push('gantt-edge--critical');
      if (dimmed) cls.push('gantt-dimmed');
      const d = edgePathD(edge.x1, edge.y1, edge.x2, edge.y2);
      svg.append(svgEl('path', { d, class: cls.join(' '), 'data-edge-key': edge.key }));
      const hit = svgEl('path', { d, class: 'gantt-edge-hit', 'data-edge-key': edge.key });
      hit.addEventListener('click', (event) => {
        event.stopPropagation();
        openDepPopover(edge, event.clientX, event.clientY);
      });
      svg.append(hit);
      const bits: string[] = [];
      if (edge.type !== 'FS') bits.push(edge.type);
      if (edge.offsetDays) bits.push(`${edge.offsetDays > 0 ? '+' : ''}${edge.offsetDays}d`);
      if (bits.length) {
        const label = svgEl('text', {
          x: (edge.x1 + edge.x2) / 2,
          y: (edge.y1 + edge.y2) / 2 - 4,
          class: `gantt-edge-label${isCritical ? ' gantt-edge-label--critical' : ''}`,
          'text-anchor': 'middle'
        });
        label.textContent = bits.join(' ');
        svg.append(label);
      }
    }

    for (const bar of layout.bars) {
      const isCritical = critical.nodes.has(bar.row.id);
      const dimmed = session.showCritical && critical.nodes.size > 0 && !isCritical;
      const group = svgEl('g', { class: 'gantt-bar-group', 'data-item-id': bar.row.id });
      group.setAttribute('transform', `translate(0,${bar.y})`);

      if (bar.row.kind === 'milestone') {
        const cx = bar.x + 8;
        const cy = GANTT_ROW_HEIGHT / 2;
        const poly = svgEl('polygon', {
          points: `${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`,
          class: `gantt-milestone${dimmed ? ' gantt-dimmed' : ''}`
        });
        const title = svgEl('title');
        title.textContent = `${bar.row.label} · due ${formatDisplayDate(bar.row.end)}`;
        poly.append(title);
        poly.addEventListener('pointerdown', (event) => startBarDrag(event, bar, 'move', group));
        group.append(poly);
        svg.append(group);
        continue;
      }

      const barY = (GANTT_ROW_HEIGHT - GANTT_BAR_HEIGHT) / 2;
      const rect = svgEl('rect', {
        x: bar.x,
        y: barY,
        width: bar.width,
        height: GANTT_BAR_HEIGHT,
        rx: GANTT_BAR_HEIGHT / 2,
        class: `gantt-bar${isCritical ? ' gantt-bar--critical' : ''}${dimmed ? ' gantt-dimmed' : ''}`
      });
      const title = svgEl('title');
      title.textContent = `${bar.row.label} · ${bar.row.status} · due ${formatDisplayDate(bar.row.end)}`;
      rect.append(title);
      rect.addEventListener('pointerdown', (event) => startBarDrag(event, bar, 'move', group));
      group.append(rect);
      group.append(
        svgEl('circle', {
          cx: bar.x + 14,
          cy: GANTT_ROW_HEIGHT / 2,
          r: 4,
          class: 'gantt-bar-dot',
          fill: STATUS_DOT[bar.row.status] ?? 'var(--shallow)'
        })
      );

      const padX = 24;
      const availPx = bar.width - padX - 10;
      if (availPx > 14) {
        const maxChars = Math.max(0, Math.floor(availPx / 6));
        let label = bar.row.label;
        if (label.length > maxChars) label = maxChars > 1 ? `${label.slice(0, maxChars - 1)}…` : '';
        if (label) {
          const clipId = `gantt-clip-${bar.row.id}`;
          const clip = svgEl('clipPath', { id: clipId });
          clip.append(
            svgEl('rect', {
              x: bar.x,
              y: barY,
              width: bar.width,
              height: GANTT_BAR_HEIGHT,
              rx: GANTT_BAR_HEIGHT / 2
            })
          );
          group.append(clip);
          const text = svgEl('text', {
            x: bar.x + padX,
            y: GANTT_ROW_HEIGHT / 2 + 4,
            'clip-path': `url(#${clipId})`,
            class: `gantt-bar-text${dimmed ? ' gantt-dimmed' : ''}`
          });
          text.textContent = label;
          group.append(text);
        }
      }

      const resizeGrip = svgEl('rect', {
        x: bar.x + bar.width - 6,
        y: barY,
        width: 6,
        height: GANTT_BAR_HEIGHT,
        class: 'gantt-resize-handle'
      });
      resizeGrip.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        startBarDrag(event, bar, 'resize', group);
      });
      group.append(resizeGrip);

      const handle = svgEl('circle', {
        cx: bar.x + bar.width,
        cy: GANTT_ROW_HEIGHT / 2,
        r: 5,
        class: 'gantt-handle'
      });
      handle.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
        startLinkDrag(event, bar);
      });
      group.append(handle);
      svg.append(group);
    }

    scroll.replaceChildren(svg);
    if (!layout.bars.length) {
      const empty = el('p', 'empty-state', 'Drop a moon onto a day to start this timeline.');
      empty.style.pointerEvents = 'none';
      empty.style.position = 'absolute';
      empty.style.left = '15rem';
      empty.style.top = '4rem';
      scroll.append(empty);
    }
  }

  function paint(): void {
    const layout = currentLayout();
    paintMoons();
    wireMoonPointers();
    paintChart(layout);
    paintRail(layout, currentGroups().map((group) => ({ id: group.project.id, title: group.project.title })));
    paintFallback(layout);
    if (previewId) showPreview(previewId);
  }

  let ghost: { line: SVGLineElement; label: SVGTextElement } | null = null;
  function clearGhost(): void {
    ghost?.line.remove();
    ghost?.label.remove();
    ghost = null;
    host.classList.remove('is-drop-target');
    scroll.querySelector('.gantt-drop-bar')?.remove();
  }

  function showGhost(target: GanttDropTarget | null): void {
    const svg = scroll.querySelector('svg');
    if (!svg || !activeLayout || !target) {
      clearGhost();
      return;
    }
    host.classList.add('is-drop-target');
    const dropDay = parseDue(target.dateKey);
    if (!dropDay) {
      clearGhost();
      return;
    }
    const x =
      activeLayout.labelWidth +
      Math.round((dropDay.getTime() - activeLayout.rangeStart.getTime()) / (24 * 60 * 60 * 1000)) *
        activeLayout.dayWidth +
      activeLayout.dayWidth / 2;
    if (!ghost) {
      const line = svgEl('line', {
        class: 'gantt-ghost-line',
        x1: x,
        y1: activeLayout.axisHeight,
        x2: x,
        y2: activeLayout.totalHeight
      });
      const label = svgEl('text', { x: x + 6, y: 16, class: 'gantt-ghost-label' });
      svg.append(line, label);
      ghost = { line, label };
    }
    ghost.line.setAttribute('x1', String(x));
    ghost.line.setAttribute('x2', String(x));
    ghost.label.setAttribute('x', String(x + 6));
    ghost.label.textContent = formatDisplayDate(target.dateKey);

    scroll.querySelector('.gantt-drop-bar')?.remove();
    if (target.kind === 'bar') {
      const highlight = svgEl('rect', {
        class: 'gantt-drop-bar',
        x: target.bar.x,
        y: target.bar.y + 4,
        width: Math.max(target.bar.width, 16),
        height: GANTT_BAR_HEIGHT,
        rx: 8
      });
      svg.append(highlight);
    }
  }

  function wireMoonPointers(): void {
    for (const card of moons.querySelectorAll<HTMLElement>('[data-task-id]')) {
      const taskId = card.dataset.taskId;
      if (!taskId) continue;
      let originX = 0;
      let originY = 0;
      let lifted = false;
      let skipClick = false;
      let ghostCard: HTMLElement | null = null;

      const finishLift = () => {
        ghostCard?.remove();
        ghostCard = null;
        lifted = false;
        card.classList.remove('is-dragging');
        card.setAttribute('aria-grabbed', 'false');
        draggingMoonId = null;
        clearGhost();
      };

      const intentAt = (clientX: number, clientY: number): PlaceIntent | null => {
        const stack =
          typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(clientX, clientY)
            : [];
        for (const node of stack) {
          if (!(node instanceof HTMLElement)) continue;
          const planet = node.closest<HTMLElement>('.gantt-planet');
          if (planet?.dataset.projectId) return { kind: 'project', projectId: planet.dataset.projectId };
          const other = node.closest<HTMLElement>('.gantt-moons [data-task-id]');
          if (other?.dataset.taskId && other.dataset.taskId !== taskId) {
            return { kind: 'parent', parentTaskId: other.dataset.taskId };
          }
        }
        if (stack.some((node) => node instanceof Node && (node === host || host.contains(node)))) {
          const target = hitFromClient(clientX, clientY) ?? lastChartTarget;
          if (target) return { kind: 'chart', target };
        }
        return null;
      };

      card.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        if (event.target instanceof Element && event.target.closest('button')) return;
        originX = event.clientX;
        originY = event.clientY;
        lifted = false;
        const onMove = (move: PointerEvent) => {
          if (!lifted && Math.hypot(move.clientX - originX, move.clientY - originY) < 8) return;
          if (!lifted) {
            lifted = true;
            skipClick = true;
            draggingMoonId = taskId;
            card.classList.add('is-dragging');
            card.setAttribute('aria-grabbed', 'true');
            ghostCard = card.cloneNode(true) as HTMLElement;
            ghostCard.classList.add('gantt-moon-ghost');
            ghostCard.style.width = `${card.getBoundingClientRect().width}px`;
            document.body.append(ghostCard);
            try {
              card.setPointerCapture(event.pointerId);
            } catch {
              /* capture is optional */
            }
          }
          if (ghostCard) {
            ghostCard.style.left = `${move.clientX - 28}px`;
            ghostCard.style.top = `${move.clientY - 18}px`;
          }
          const stack =
            typeof document.elementsFromPoint === 'function'
              ? document.elementsFromPoint(move.clientX, move.clientY)
              : [];
          const overChart = stack.some((node) => node === host || host.contains(node));
          if (overChart) {
            lastChartTarget = hitFromClient(move.clientX, move.clientY);
            showGhost(lastChartTarget);
          } else clearGhost();
        };
        const onUp = (up: PointerEvent) => {
          window.removeEventListener('pointermove', onMove);
          const intent = lifted ? intentAt(up.clientX, up.clientY) : null;
          finishLift();
          if (intent) void placeMoon(taskId, intent);
          else if (skipClick) flash('Drop on a day, a bar, a planet, or another moon.');
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      });
      card.addEventListener(
        'click',
        (event) => {
          if (!skipClick) return;
          event.preventDefault();
          event.stopPropagation();
          skipClick = false;
        },
        true
      );
    }
  }

  function hitFromClient(clientX: number, clientY: number): GanttDropTarget | null {
    const svg = scroll.querySelector('svg');
    if (!svg || !activeLayout) return null;
    const pt = clientToSvg(svg, clientX, clientY);
    return dropTargetAt(activeLayout, pt.x, pt.y, session.projectId || null);
  }

  wireDrop(host, (taskId, event) => {
    const target = hitFromClient(event.clientX, event.clientY) ?? lastChartTarget;
    clearGhost();
    lastChartTarget = null;
    if (target) void placeMoon(taskId, { kind: 'chart', target });
    else flash('Drop on a day, a bar, or a project band to place that moon.');
  });
  host.addEventListener('dragover', (event) => {
    const target = hitFromClient(event.clientX, event.clientY);
    lastChartTarget = target;
    showGhost(target);
  });
  host.addEventListener('dragleave', (event) => {
    if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    clearGhost();
  });

  document.addEventListener('click', (event) => {
    if (activePopover && event.target instanceof Node && !activePopover.contains(event.target)) {
      if (!(event.target instanceof Element) || !event.target.closest('.gantt-edge-hit')) closePopover();
    }
  });

  paint();
}
