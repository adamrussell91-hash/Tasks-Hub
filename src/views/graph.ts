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
import { tasksApi } from '@/services/client-api';

type GraphMode = 'blockers' | 'workstreams';

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

function buildModel(tasks: Task[], projects: Project[], mode: GraphMode): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  if (mode === 'blockers') {
    const involved = new Set<string>();
    for (const task of tasks) {
      if (task.depends_on.length) {
        involved.add(task.id);
        for (const id of task.depends_on) involved.add(id);
      }
    }
    const nodes: GraphNode[] = tasks
      .filter((t) => involved.has(t.id))
      .map((t) => ({
        id: t.id,
        kind: 'task',
        label: t.title,
        domain: t.domain
      }));
    const links: GraphLink[] = [];
    for (const task of tasks) {
      for (const dep of task.depends_on) {
        if (involved.has(task.id) && involved.has(dep)) {
          links.push({ source: dep, target: task.id, kind: 'blocker' });
        }
      }
    }
    return { nodes, links };
  }

  // workstreams — projects as hubs, tasks as spokes
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

function mountGraph(host: HTMLElement, tasks: Task[], projects: Project[], mode: GraphMode): void {
  const { nodes, links } = buildModel(tasks, projects, mode);
  host.replaceChildren();

  if (!nodes.length) {
    host.append(
      el(
        'p',
        'empty-state',
        mode === 'blockers'
          ? 'No dependency edges match this filter. Clear search or add depends_on on tasks.'
          : 'No project workstreams match this filter. Assign tasks to a project.'
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

  const preview = el('aside', 'graph-preview');
  preview.hidden = true;
  host.append(preview);

  const ctx = canvas.getContext('2d')!;
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.map((l) => ({ ...l }));

  let selected: string | null = null;
  let hover: GraphNode | null = null;

  const simulation: Simulation<GraphNode, GraphLink> = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<GraphNode, GraphLink>(simLinks)
        .id((n) => n.id)
        .distance(mode === 'blockers' ? 110 : 88)
        .strength(0.45)
    )
    .force('charge', forceManyBody<GraphNode>().strength(mode === 'workstreams' ? -420 : -280))
    .force('x', forceX(width / 2).strength(0.05))
    .force('y', forceY(height / 2).strength(0.05))
    .force(
      'collide',
      forceCollide<GraphNode>().radius((n) => (n.kind === 'project' ? 28 : 18))
    )
    .on('tick', draw);

  function draw(): void {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.lineWidth = 1.25;
    for (const link of simLinks) {
      const s = typeof link.source === 'object' ? link.source : null;
      const t = typeof link.target === 'object' ? link.target : null;
      if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue;
      ctx.strokeStyle =
        link.kind === 'blocker' ? 'rgba(155, 44, 44, 0.45)' : 'rgba(55, 111, 183, 0.35)';
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
          ? '#17375e'
          : node.id === selected || node === hover
            ? '#376fb7'
            : '#244f7c';
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (node.id === selected || node === hover) {
        ctx.fillStyle = '#13233a';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(node.label.slice(0, 28), node.x + r + 6, node.y + 4);
      }
    }
  }

  function nodeAt(mx: number, my: number): GraphNode | null {
    for (const node of simNodes) {
      if (node.x == null || node.y == null) continue;
      const r = node.kind === 'project' ? 18 : 14;
      if (Math.hypot(node.x - mx, node.y - my) <= r) return node;
    }
    return null;
  }

  function showPreview(node: GraphNode): void {
    selected = node.id;
    preview.hidden = false;
    preview.replaceChildren(
      el('p', 'graph-preview__eyebrow', node.kind),
      el('h3', 'graph-preview__title', node.label),
      el('p', 'graph-preview__meta', node.domain ?? node.id)
    );
    draw();
  }

  const list = el('ul', 'viz-alt');
  list.setAttribute('aria-label', mode === 'blockers' ? 'Blocker nodes' : 'Workstream nodes');
  for (const node of simNodes) {
    const item = el('li');
    const btn = el('button', 'btn btn--ghost', `${node.kind}: ${node.label}`);
    btn.type = 'button';
    btn.addEventListener('click', () => showPreview(node));
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
    if (node) showPreview(node);
  });

  simulation.alpha(1).restart();
}

/** Graph rail page — Knowledge-style force layout over blockers / workstreams. */
export async function renderGraphView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading graph…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);

  let mode: GraphMode = 'blockers';
  canvas.replaceChildren();
  canvas.append(
    el('p', 'view-lede', 'Dependency and project structure. Search / select / preview borrowed from Knowledge Hub.')
  );

  const toolbar = el('div', 'graph-toolbar');
  const modes = el('div', 'hub-pills');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Graph mode');
  const blockersBtn = el('button', 'hub-pills__btn is-active', 'Blockers');
  blockersBtn.type = 'button';
  blockersBtn.setAttribute('aria-pressed', 'true');
  const workBtn = el('button', 'hub-pills__btn', 'Workstreams');
  workBtn.type = 'button';
  workBtn.setAttribute('aria-pressed', 'false');
  modes.append(blockersBtn, workBtn);
  const search = el('input', 'hub-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = 'Filter nodes…';
  search.setAttribute('aria-label', 'Filter graph');
  toolbar.append(modes, search);
  canvas.append(toolbar);

  const host = el('div', 'graph-host');
  canvas.append(host);

  const paint = () => {
    const q = search.value.trim().toLowerCase();
    const filteredTasks = q
      ? tasks.filter((t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
      : tasks;
    const filteredProjects = q
      ? projects.filter((p) => p.title.toLowerCase().includes(q))
      : projects;
    // Keep linked partners for blockers when filtering
    mountGraph(host, filteredTasks.length ? filteredTasks : tasks, filteredProjects, mode);
  };

  blockersBtn.addEventListener('click', () => {
    mode = 'blockers';
    blockersBtn.classList.add('is-active');
    blockersBtn.setAttribute('aria-pressed', 'true');
    workBtn.classList.remove('is-active');
    workBtn.setAttribute('aria-pressed', 'false');
    paint();
  });
  workBtn.addEventListener('click', () => {
    mode = 'workstreams';
    workBtn.classList.add('is-active');
    workBtn.setAttribute('aria-pressed', 'true');
    blockersBtn.classList.remove('is-active');
    blockersBtn.setAttribute('aria-pressed', 'false');
    paint();
  });
  search.addEventListener('input', () => paint());
  paint();
}
