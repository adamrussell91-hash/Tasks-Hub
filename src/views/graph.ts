import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation
} from 'd3-force';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { isBlocked } from '@/domain/board';
import { tasksApi } from '@/services/client-api';
import { hashQuery } from '@/shell/shell';
import { blockerRows, layoutBlockerGraph, type BlockerNode, type BlockerRow } from '@/domain/blockers';
import { renderGraphFamilyPills } from '@/views/stretch-pills';
import { renderBoardTaskTile, renderTaskLinkList } from '@/views/task-tile';

type GraphMode = 'blockers' | 'workstreams';

function tokenColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

type GraphNode = {
  id: string;
  kind: 'task' | 'project';
  label: string;
  domain?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: 'blocker' | 'workstream';
};

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

function statusChip(status: Task['status'], blocked: boolean): HTMLElement {
  if (blocked) return el('span', 'chip', 'Blocked');
  if (status === 'done') return el('span', 'chip chip--muted', 'Done');
  if (status === 'in_progress') return el('span', 'chip', 'In progress');
  return el('span', 'chip chip--muted', 'Open');
}

function groupBlockerRows(rows: BlockerRow[]): Map<string, BlockerRow[]> {
  const groups = new Map<string, BlockerRow[]>();
  for (const row of rows) {
    const list = groups.get(row.blockedId) ?? [];
    list.push(row);
    groups.set(row.blockedId, list);
  }
  return groups;
}

function buildWorkstreamModel(tasks: Task[], projects: Project[]): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodes: GraphNode[] = [
    ...projects.map((p) => ({
      id: p.id,
      kind: 'project' as const,
      label: p.title
    })),
    ...tasks
      .filter((t) => t.parent_project_id)
      .map((t) => ({
        id: t.id,
        kind: 'task' as const,
        label: t.title,
        domain: t.domain
      }))
  ];
  const projectIds = new Set(projects.map((p) => p.id));
  const links: GraphLink[] = tasks
    .filter((t) => t.parent_project_id && projectIds.has(t.parent_project_id))
    .map((t) => ({
      source: t.parent_project_id!,
      target: t.id,
      kind: 'workstream' as const
    }));
  return { nodes, links };
}

function renderBlockerDetail(task: Task, tasks: Task[]): HTMLElement {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const detail = el('div', 'task-tile__detail-body');
  const blockers = task.depends_on
    .map((id) => byId.get(id))
    .filter((item): item is Task => Boolean(item));
  const blocking = tasks.filter((item) => item.depends_on.includes(task.id));

  if (blockers.length) {
    detail.append(
      renderTaskLinkList(
        'Blocked by',
        blockers.map((blocker) => ({
          title: blocker.title,
          meta: blocker.status.replace('_', ' ')
        }))
      )
    );
  }
  if (blocking.length) {
    detail.append(
      renderTaskLinkList(
        'Blocking',
        blocking.map((blocked) => ({
          title: blocked.title,
          meta: isBlocked(blocked, byId) ? 'blocked' : blocked.status.replace('_', ' ')
        }))
      )
    );
  }
  if (!blockers.length && !blocking.length) {
    detail.append(el('p', 'hierarchy-meta', 'No blocker links on this task.'));
  }
  return detail;
}

function mountBlockerGraph(
  host: HTMLElement,
  tasks: Task[],
  projects: Project[],
  activeOnly: boolean,
  editorHost: HTMLElement,
  selectedId: string | null,
  expandedId: string | null,
  onSelect: (taskId: string | null) => void,
  onExpand: (taskId: string, open: boolean) => void,
  onRefresh: () => void
): void {
  host.replaceChildren();
  const layout = layoutBlockerGraph(tasks);
  const rows = blockerRows(tasks, activeOnly);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  if (!layout.totalLinkCount) {
    host.append(
      el(
        'p',
        'empty-state',
        'No blocked-by links yet. Add a blocker on a task to see the chain here.'
      )
    );
    return;
  }

  host.append(
    el(
      'p',
      'blocker-summary',
      layout.blockedCount
        ? `${layout.blockedCount} task${layout.blockedCount === 1 ? '' : 's'} blocked · ${layout.activeLinkCount} active link${layout.activeLinkCount === 1 ? '' : 's'}`
        : `Nothing blocked right now · ${layout.totalLinkCount} resolved link${layout.totalLinkCount === 1 ? '' : 's'}`
    )
  );

  const tableWrap = el('div', 'blocker-table-wrap');
  const table = el('table', 'viz-alt viz-alt--table blocker-table');
  table.setAttribute('aria-label', 'Blocker relationships');
  const head = document.createElement('thead');
  head.innerHTML =
    '<tr><th scope="col">Blocked task</th><th scope="col">Waiting on</th><th scope="col">Blocker status</th></tr>';
  table.append(head);

  const body = document.createElement('tbody');
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.className = 'empty-state';
    cell.textContent = activeOnly
      ? 'No active blockers match this filter. Switch to All links or clear search.'
      : 'No blocker links match this filter.';
    row.append(cell);
    body.append(row);
  } else {
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.tabIndex = 0;
      tr.dataset.taskId = row.blockedId;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-expanded', selectedId === row.blockedId ? 'true' : 'false');
      if (selectedId === row.blockedId) tr.classList.add('is-selected');
      tr.setAttribute('aria-label', `${row.blockedTitle} is blocked by ${row.blockerTitle}`);

      const blockedCell = document.createElement('td');
      blockedCell.append(
        el('span', 'blocker-table__task', row.blockedTitle),
        statusChip(row.blockedStatus, row.blocked)
      );
      const blockerCell = document.createElement('td');
      blockerCell.textContent = row.blockerTitle;
      const statusCell = document.createElement('td');
      statusCell.append(
        statusChip(row.blockerStatus, false),
        row.active ? el('span', 'chip', 'Active') : el('span', 'chip chip--muted', 'Resolved')
      );

      const select = () => onSelect(selectedId === row.blockedId ? null : row.blockedId);
      tr.addEventListener('click', select);
      tr.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          select();
        }
      });

      tr.append(blockedCell, blockerCell, statusCell);
      body.append(tr);
    }
  }
  table.append(body);
  tableWrap.append(table);
  host.append(tableWrap);

  const expandHost = el('div', 'task-stack blocker-expand');
  if (selectedId) {
    const task = byId.get(selectedId);
    const taskRows = groupBlockerRows(rows).get(selectedId) ?? [];
    if (task) {
      const waitingOn = taskRows.map((row) => row.blockerTitle).join(', ');
      expandHost.append(
        renderBoardTaskTile(
          task,
          waitingOn ? `waiting on ${waitingOn}` : 'blocker links',
          renderBlockerDetail(task, tasks),
          {
            editorHost,
            projects,
            onSaved: onRefresh,
            open: expandedId === selectedId,
            onToggle: (taskId, open) => onExpand(taskId, open)
          }
        )
      );
    }
  }
  host.append(expandHost);

  const pad = 24;
  const width = Math.max(layout.width + pad, host.clientWidth || 720);
  const height = Math.max(layout.height + pad, 280);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'blocker-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Blocker map');
  svg.style.width = '100%';
  svg.style.height = `${Math.min(height, 360)}px`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'blocker-arrow');
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '8');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  arrowPath.setAttribute('class', 'blocker-edge__head');
  marker.append(arrowPath);
  defs.append(marker);
  svg.append(defs);

  const nodeMap = new Map(layout.nodes.map((node) => [node.id, node]));
  const edges = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edges.setAttribute('class', 'blocker-edges');
  for (const link of layout.links) {
    if (activeOnly && !link.active) continue;
    const from = nodeMap.get(link.blockerId);
    const to = nodeMap.get(link.blockedId);
    if (!from || !to) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const midX = (from.x + to.x) / 2;
    path.setAttribute(
      'd',
      `M ${from.x + 108} ${from.y + 18} C ${midX} ${from.y + 18}, ${midX} ${to.y + 18}, ${to.x} ${to.y + 18}`
    );
    path.setAttribute(
      'class',
      link.active ? 'blocker-edge blocker-edge--active' : 'blocker-edge blocker-edge--resolved'
    );
    path.setAttribute('marker-end', 'url(#blocker-arrow)');
    edges.append(path);
  }
  svg.append(edges);

  const nodes = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  nodes.setAttribute('class', 'blocker-nodes');
  for (const node of layout.nodes) {
    if (activeOnly && !rows.some((row) => row.blockedId === node.id || row.blockerId === node.id)) {
      continue;
    }
    nodes.append(
      renderBlockerNode(node, selectedId === node.id, () =>
        onSelect(selectedId === node.id ? null : node.id)
      )
    );
  }
  svg.append(nodes);
  host.append(svg);
}

function renderBlockerNode(
  node: BlockerNode,
  selected: boolean,
  onSelect: () => void
): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute(
    'class',
    `branch-node blocker-node${node.blocked ? ' blocker-node--blocked' : ''}${selected ? ' blocker-node--selected' : ''}`
  );
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'button');
  g.setAttribute('aria-pressed', selected ? 'true' : 'false');
  g.setAttribute('aria-label', `${node.label}${node.blocked ? ' — blocked' : ''}`);
  g.style.setProperty('--branch-delay', `${node.depth * 70}ms`);

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', String(node.x));
  rect.setAttribute('y', String(node.y));
  rect.setAttribute('rx', '10');
  rect.setAttribute('ry', '10');
  rect.setAttribute('width', '220');
  rect.setAttribute('height', '36');
  rect.setAttribute('class', 'branch-node__shape');

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(node.x + 12));
  text.setAttribute('y', String(node.y + 23));
  text.setAttribute('class', 'branch-node__label');
  text.setAttribute('title', node.label);
  text.textContent = node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label;

  const select = () => onSelect();
  g.addEventListener('click', select);
  g.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });
  g.append(rect, text);
  return g;
}

function mountWorkstreamGraph(
  host: HTMLElement,
  tasks: Task[],
  projects: Project[],
  editorHost: HTMLElement,
  selectedId: string | null,
  expandedId: string | null,
  onSelect: (taskId: string | null) => void,
  onExpand: (taskId: string, open: boolean) => void,
  onRefresh: () => void
): void {
  const { nodes, links } = buildWorkstreamModel(tasks, projects);
  host.replaceChildren();

  if (!nodes.length) {
    host.append(
      el(
        'p',
        'empty-state',
        'No project workstreams match this filter. Assign tasks to a project.'
      )
    );
    return;
  }

  const width = host.clientWidth || 960;
  const height = Math.max(520, Math.floor(window.innerHeight * 0.62));
  const canvas = document.createElement('canvas');
  canvas.className = 'graph-canvas';
  canvas.width = Math.floor(width * devicePixelRatio);
  canvas.height = Math.floor(height * devicePixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  host.append(canvas);

  const tip = el('div', 'graph-tip');
  tip.hidden = true;
  host.append(tip);

  const ctx = canvas.getContext('2d')!;
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l }));

  let selected: string | null = selectedId;
  let hover: GraphNode | null = null;

  const simulation: Simulation<GraphNode, GraphLink> = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(simLinks)
        .id((n) => n.id)
        .distance(88)
        .strength(0.45)
    )
    .force('charge', forceManyBody<GraphNode>().strength(-640))
    .force('x', forceX(width / 2).strength(0.04))
    .force('y', forceY(height / 2).strength(0.04))
    .force('collide', forceCollide<GraphNode>().radius((n) => (n.kind === 'project' ? 46 : 28)))
    .on('tick', draw);

  function draw(): void {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1.25;
    for (const link of simLinks) {
      const s = typeof link.source === 'object' ? link.source : null;
      const t = typeof link.target === 'object' ? link.target : null;
      if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue;
      ctx.strokeStyle = tokenColor('--wave', '#376fb7');
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = node.kind === 'project' ? 16 : 11;
      ctx.beginPath();
      ctx.fillStyle =
        node.kind === 'project'
          ? tokenColor('--navy', '#17375e')
          : node.id === selected || node === hover
            ? tokenColor('--wave', '#376fb7')
            : tokenColor('--navy-2', '#244f7c');
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (node.id === selected || node === hover) {
        ctx.fillStyle = tokenColor('--ink', '#13233a');
        ctx.font = `${getComputedStyle(document.documentElement).getPropertyValue('--text-xs') || '12px'} ${getComputedStyle(document.documentElement).getPropertyValue('--font-ui') || 'Inter, sans-serif'}`;
        ctx.fillText(node.label.slice(0, 28), node.x + r + 6, node.y + 4);
      }
    }
  }

  function nodeAt(mx: number, my: number): GraphNode | null {
    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = node.kind === 'project' ? 22 : 18;
      if (Math.hypot(node.x - mx, node.y - my) <= r) return node;
    }
    return null;
  }

  function showSelection(node: GraphNode): void {
    selected = node.id;
    if (node.kind === 'task') onSelect(node.id);
    else onSelect(null);
    draw();
  }

  const expandHost = el('div', 'task-stack graph-expand');
  if (selectedId) {
    const task = tasks.find((item) => item.id === selectedId);
    if (task) {
      const project = projects.find((item) => item.id === task.parent_project_id);
      const detail = el('div', 'task-tile__detail-body');
      detail.append(
        el(
          'p',
          'hierarchy-meta',
          project ? `Project · ${project.title}` : 'No project assigned'
        )
      );
      expandHost.append(
        renderBoardTaskTile(task, project?.title ?? task.domain, detail, {
          editorHost,
          projects,
          onSaved: onRefresh,
          open: expandedId === selectedId,
          onToggle: (taskId, open) => onExpand(taskId, open)
        })
      );
    }
  }
  host.append(expandHost);

  const list = el('ul', 'viz-alt');
  list.setAttribute('aria-label', 'Workstream nodes');
  for (const node of simNodes) {
    const item = el('li');
    const btn = el('button', 'btn btn--ghost', `${node.kind}: ${node.label}`);
    btn.type = 'button';
    btn.addEventListener('click', () => showSelection(node));
    item.append(btn);
    list.append(item);
  }
  host.append(list);

  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const node = nodeAt(event.clientX - rect.left, event.clientY - rect.top);
    hover = node;
    if (node) {
      tip.hidden = false;
      tip.textContent = node.label;
      tip.style.left = `${event.clientX - rect.left + 12}px`;
      tip.style.top = `${event.clientY - rect.top + 12}px`;
    } else {
      tip.hidden = true;
    }
    draw();
  });

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    const node = nodeAt(event.clientX - rect.left, event.clientY - rect.top);
    if (node) showSelection(node);
  });

  simulation.alpha(1).restart();
}

/** Graph rail page — readable blocker map plus workstream force layout. */
export async function renderGraphView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading graph…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);

  const mode: GraphMode = hashQuery().get('mode') === 'workstreams' ? 'workstreams' : 'blockers';
  canvas.replaceChildren();

  const toolbar = el('div', 'graph-toolbar');
  toolbar.append(renderGraphFamilyPills('graph', mode));
  const search = el('input', 'hub-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = mode === 'blockers' ? 'Filter blocked tasks…' : 'Filter nodes…';
  search.setAttribute('aria-label', 'Filter graph');

  let activeOnly = true;
  if (mode === 'blockers') {
    const filter = el('div', 'hub-pills');
    filter.setAttribute('role', 'group');
    filter.setAttribute('aria-label', 'Blocker link filter');
    const activeBtn = el('button', 'hub-pills__btn is-active', 'Active links');
    const allBtn = el('button', 'hub-pills__btn', 'All links');
    activeBtn.type = 'button';
    allBtn.type = 'button';
    activeBtn.setAttribute('aria-pressed', 'true');
    allBtn.setAttribute('aria-pressed', 'false');
    activeBtn.addEventListener('click', () => {
      activeOnly = true;
      activeBtn.classList.add('is-active');
      allBtn.classList.remove('is-active');
      activeBtn.setAttribute('aria-pressed', 'true');
      allBtn.setAttribute('aria-pressed', 'false');
      paint();
    });
    allBtn.addEventListener('click', () => {
      activeOnly = false;
      allBtn.classList.add('is-active');
      activeBtn.classList.remove('is-active');
      allBtn.setAttribute('aria-pressed', 'true');
      activeBtn.setAttribute('aria-pressed', 'false');
      paint();
    });
    filter.append(activeBtn, allBtn);
    toolbar.append(filter);
  }

  toolbar.append(search);
  canvas.append(toolbar);

  const confirmHost = el('div', 'graph-confirm');
  canvas.append(confirmHost);

  const host = el('div', 'graph-host');
  const stage = el('div', 'graph-stage');
  host.append(stage);
  canvas.append(host);

  let selectedId: string | null = null;
  let expandedId: string | null = null;

  const paint = () => {
    confirmHost.replaceChildren();
    const q = search.value.trim().toLowerCase();
    const filteredTasks = q
      ? tasks.filter((task) => task.title.toLowerCase().includes(q) || task.description.toLowerCase().includes(q))
      : tasks;
    const filteredProjects = q
      ? projects.filter((project) => project.title.toLowerCase().includes(q))
      : projects;
    const scopedTasks = filteredTasks.length ? filteredTasks : tasks;

    if (selectedId && !scopedTasks.some((task) => task.id === selectedId)) {
      selectedId = null;
      expandedId = null;
    }
    if (expandedId && expandedId !== selectedId) {
      expandedId = null;
    }

    if (mode === 'blockers') {
      mountBlockerGraph(
        stage,
        scopedTasks,
        projects,
        activeOnly,
        confirmHost,
        selectedId,
        expandedId,
        (taskId) => {
          selectedId = taskId;
          expandedId = null;
          paint();
        },
        (taskId, open) => {
          expandedId = open ? taskId : null;
          paint();
        },
        paint
      );
      return;
    }

    mountWorkstreamGraph(
      stage,
      scopedTasks,
      filteredProjects.length ? filteredProjects : projects,
      confirmHost,
      selectedId,
      expandedId,
      (taskId) => {
        selectedId = taskId;
        expandedId = null;
        paint();
      },
      (taskId, open) => {
        expandedId = open ? taskId : null;
        paint();
      },
      paint
    );
  };

  search.addEventListener('input', () => paint());
  paint();
}
