import type { PipeLayout, PipeNodeLayout, FocusPipeLayout, HubPipeLayout } from '@/domain/pipe-layout';
import { GATE_H, PIPE_W } from '@/domain/pipe-layout';
import { daysSince } from '@/domain/gates';

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
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function waterColor(blockedSince: string | null): string {
  const days = daysSince(blockedSince);
  const t = Math.min(1, days / 30);
  const light = { r: 180, g: 210, b: 240 };
  const dark = { r: 55, g: 111, b: 183 };
  const r = Math.round(light.r + (dark.r - light.r) * t);
  const g = Math.round(light.g + (dark.g - light.g) * t);
  const b = Math.round(light.b + (dark.b - light.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderGate(node: PipeNodeLayout, onSelect: (id: string) => void): SVGGElement {
  const g = svgEl('g', { class: `blocker-pipe__gate blocker-pipe__gate--${node.gateState}` });
  g.setAttribute('role', 'button');
  g.setAttribute('tabindex', '0');
  g.setAttribute('aria-label', `${node.title}, ${node.gateState} gate`);

  const hit = svgEl('rect', {
    x: node.x,
    y: node.y - 10,
    width: PIPE_W,
    height: GATE_H + 20,
    fill: 'transparent'
  });

  const bar = svgEl('rect', {
    x: node.x,
    y: node.y,
    width: PIPE_W,
    height: GATE_H,
    rx: 4,
    class: 'blocker-pipe__gate-bar'
  });

  const leftLeaf = svgEl('rect', {
    x: node.x + 8,
    y: node.y + 2,
    width: (PIPE_W - 24) / 2,
    height: GATE_H - 4,
    rx: 2,
    class: 'blocker-pipe__gate-leaf blocker-pipe__gate-leaf--left'
  });
  const rightLeaf = svgEl('rect', {
    x: node.x + PIPE_W / 2 + 4,
    y: node.y + 2,
    width: (PIPE_W - 24) / 2,
    height: GATE_H - 4,
    rx: 2,
    class: 'blocker-pipe__gate-leaf blocker-pipe__gate-leaf--right'
  });

  const label = svgEl('text', {
    x: node.x + PIPE_W / 2,
    y: node.y - 6,
    class: 'blocker-pipe__label',
    'text-anchor': 'middle'
  });
  label.textContent = node.title.length > 18 ? `${node.title.slice(0, 17)}…` : node.title;

  const select = () => onSelect(node.id);
  g.addEventListener('click', select);
  g.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });

  g.append(hit, bar, leftLeaf, rightLeaf, label);
  return g;
}

function renderChamber(node: PipeNodeLayout, svg: SVGSVGElement): SVGGElement {
  const g = svgEl('g', { class: `blocker-pipe__chamber blocker-pipe__chamber--${node.gateState}` });
  const top = node.y + GATE_H;
  const fullHeight = node.chamberHeight;
  const waterHeight =
    node.gateState === 'resolved' ? 0 : node.gateState === 'queued' ? fullHeight * 0.35 : fullHeight;

  const shell = svgEl('rect', {
    x: node.x,
    y: top,
    width: PIPE_W,
    height: fullHeight,
    rx: 8,
    class: 'blocker-pipe__chamber-shell'
  });

  const clipId = `chamber-clip-${node.id.replace(/[^a-z0-9_-]/gi, '')}`;
  const defs = svg.querySelector('defs') ?? svgEl('defs');
  if (!svg.querySelector('defs')) svg.prepend(defs);

  const clip = svgEl('clipPath', { id: clipId });
  clip.append(
    svgEl('rect', { x: node.x, y: top, width: PIPE_W, height: fullHeight, rx: 8 })
  );
  defs.append(clip);

  const water = svgEl('rect', {
    x: node.x,
    y: top + fullHeight - waterHeight,
    width: PIPE_W,
    height: waterHeight,
    class: 'blocker-pipe__chamber-fill',
    fill: waterColor(node.blocked_since),
    'clip-path': `url(#${clipId})`
  });
  water.style.transition = 'height 500ms cubic-bezier(0.4, 0, 0.2, 1), y 500ms cubic-bezier(0.4, 0, 0.2, 1)';

  if (node.gateState === 'queued') {
    shell.setAttribute('stroke-dasharray', '4 4');
  }
  if (node.gateState === 'orphan') {
    shell.classList.add('blocker-pipe__chamber-shell--orphan');
  }

  g.append(shell, water);
  return g;
}

const JUNCTION_OFFSET = 8;

function renderJunction(layout: FocusPipeLayout): SVGGElement {
  const g = svgEl('g', { class: 'blocker-pipe__junctions' });
  for (const junction of layout.junctions) {
    if (junction.branchXs.length < 2) continue;
    const path = svgEl('path', { class: 'blocker-pipe__junction' });
    const [x1, x2] = [junction.branchXs[0]!, junction.branchXs[junction.branchXs.length - 1]!];
    const y0 = junction.y - JUNCTION_OFFSET;
    const y1 = junction.y;
    const midX = (x1 + x2) / 2;
    path.setAttribute(
      'd',
      `M ${x1} ${y0} C ${x1} ${y1 - 12}, ${midX} ${y1 - 12}, ${midX} ${y1} C ${midX} ${y1 - 12}, ${x2} ${y1 - 12}, ${x2} ${y0}`
    );
    g.append(path);
  }
  return g;
}

function renderFocusPipe(
  layout: FocusPipeLayout,
  onSelect: (id: string) => void
): HTMLElement {
  const wrap = el('div', 'blocker-pipe-wrap');
  const svg = svgEl('svg', {
    class: 'blocker-pipe-svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: 'img',
    'aria-labelledby': 'blocker-pipe-summary'
  });
  svg.style.width = '100%';

  const pipes = svgEl('g', { class: 'blocker-pipe__pipes' });
  for (const node of layout.nodes) {
    pipes.append(renderChamber(node, svg as SVGSVGElement), renderGate(node, onSelect));
  }
  pipes.append(renderJunction(layout));
  svg.append(pipes);
  wrap.append(svg);
  return wrap;
}

function renderHubPipe(
  layout: HubPipeLayout,
  onSelect: (id: string) => void
): HTMLElement {
  const wrap = el('div', 'blocker-pipe-wrap blocker-pipe-wrap--hub');
  const svg = svgEl('svg', {
    class: 'blocker-pipe-svg',
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: 'img',
    'aria-labelledby': 'blocker-pipe-summary'
  });
  svg.style.width = '100%';

  for (const component of layout.components) {
    const node: PipeNodeLayout = {
      id: component.readyGateId,
      title: component.title,
      rank: 0,
      branch: 0,
      x: component.x,
      y: component.y,
      chamberHeight: component.chamberHeight,
      gateState: 'ready',
      blocked_since: component.blocked_since,
      fanOut: component.fanOut
    };
    svg.append(renderChamber(node, svg as SVGSVGElement), renderGate(node, onSelect));

    const meta = svgEl('text', {
      x: component.x + PIPE_W + 16,
      y: component.y + GATE_H + 18,
      class: 'blocker-pipe__hub-meta'
    });
    meta.textContent = `Clears ${component.fanOut} · ${component.queuedCount ? `+${component.queuedCount} queued` : 'no queue'}`;
    svg.append(meta);
  }

  wrap.append(svg);
  return wrap;
}

function renderSrTable(layout: PipeLayout): HTMLElement {
  const table = el('table', 'viz-alt viz-alt--table blocker-pipe__sr');
  table.setAttribute('aria-label', 'Blocker pipe data');
  const head = document.createElement('thead');
  head.innerHTML =
    '<tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Waiting on</th><th scope="col">Days blocked</th><th scope="col">Role</th></tr>';
  const body = document.createElement('tbody');
  for (const row of layout.srRows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.task}</td><td>${row.status}</td><td>${row.waitingOn}</td><td>${row.daysBlocked}</td><td>${row.role}</td>`;
    body.append(tr);
  }
  table.append(head, body);
  return table;
}

export function renderBlockerPipes(
  layout: PipeLayout,
  onSelectGate: (taskId: string) => void
): HTMLElement {
  const host = el('div', 'blocker-pipe-host');
  const summary = el('p', 'blocker-summary');
  summary.id = 'blocker-pipe-summary';
  summary.textContent = layout.summary;
  host.append(summary);

  for (const warning of layout.warnings) {
    host.append(el('p', 'empty-state', warning));
  }

  host.append(
    layout.mode === 'focus' ? renderFocusPipe(layout, onSelectGate) : renderHubPipe(layout, onSelectGate)
  );

  const sr = renderSrTable(layout);
  sr.classList.add('sr-only');
  host.append(sr);

  return host;
}
