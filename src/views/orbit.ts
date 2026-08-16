import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { domainFill, layoutOrbit, type OrbitBody } from '@/domain/orbit';

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

function showPreview(preview: HTMLElement, body: OrbitBody): void {
  preview.hidden = false;
  preview.replaceChildren(
    el('p', 'graph-preview__eyebrow', body.kind),
    el('h3', 'graph-preview__title', body.label),
    el(
      'p',
      'graph-preview__meta',
      [
        body.domain ?? '—',
        body.priority !== '—' ? body.priority : null,
        body.due_date ? `due ${body.due_date.slice(0, 10)}` : null
      ]
        .filter(Boolean)
        .join(' · ')
    )
  );
}

function mountOrbit(host: HTMLElement, tasks: Task[], projects: Project[]): void {
  host.replaceChildren();
  const width = host.clientWidth || 960;
  const height = Math.max(520, Math.floor(window.innerHeight * 0.62));
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(cx, cy) - 36;
  const scaled = layoutOrbit(tasks, projects, new Date(), {
    minRadius: Math.max(48, maxR * 0.22),
    maxRadius: maxR
  });
  if (!scaled.length) {
    host.append(el('p', 'empty-state', 'Nothing in orbit — add open tasks or active projects.'));
    return;
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'orbit-svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Orbit view — urgency as distance from centre');
  svg.style.width = '100%';
  svg.style.height = `${height}px`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <radialGradient id="orbit-sky" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="var(--wave)" stop-opacity="0.18"/>
      <stop offset="55%" stop-color="var(--marine)" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="var(--depth)" stop-opacity="0.04"/>
    </radialGradient>
  `;
  svg.append(defs);

  const sky = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  sky.setAttribute('width', String(width));
  sky.setAttribute('height', String(height));
  sky.setAttribute('fill', 'url(#orbit-sky)');
  svg.append(sky);

  for (const ring of [0.35, 0.62, 0.92]) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('class', 'orbit-ring');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(maxR * ring));
    svg.append(circle);
  }

  const spin = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  spin.setAttribute('class', 'orbit-spin');
  spin.setAttribute('transform-origin', `${cx}px ${cy}px`);

  const tip = el('div', 'graph-tip');
  tip.hidden = true;
  const preview = el('aside', 'graph-preview');
  preview.hidden = true;

  for (const body of scaled) {
    const x = cx + Math.cos(body.angle) * body.radius;
    const y = cy + Math.sin(body.angle) * body.radius;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'orbit-body');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${body.kind}: ${body.label}`);
    g.dataset.id = body.id;

    const planet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    planet.setAttribute('cx', String(x));
    planet.setAttribute('cy', String(y));
    planet.setAttribute('r', String(body.size));
    planet.setAttribute('fill', domainFill(body.domain));
    planet.setAttribute('stroke', body.kind === 'project' ? 'var(--navy)' : 'var(--marine)');
    planet.setAttribute('stroke-width', body.kind === 'project' ? '2.25' : '1.25');
    planet.setAttribute('class', 'orbit-planet');

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String(x + body.size + 6));
    label.setAttribute('y', String(y + 4));
    label.setAttribute('class', 'orbit-label');
    label.textContent = body.label.slice(0, 26);

    const select = () => showPreview(preview, body);
    g.addEventListener('click', select);
    g.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });
    g.addEventListener('mouseenter', (event) => {
      const rect = host.getBoundingClientRect();
      tip.hidden = false;
      tip.textContent = body.label;
      tip.style.left = `${event.clientX - rect.left + 12}px`;
      tip.style.top = `${event.clientY - rect.top + 12}px`;
    });
    g.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });

    g.append(planet, label);
    spin.append(g);
  }

  svg.append(spin);

  const centre = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  centre.setAttribute('class', 'orbit-centre');
  const core = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  core.setAttribute('cx', String(cx));
  core.setAttribute('cy', String(cy));
  core.setAttribute('r', '22');
  core.setAttribute('fill', 'var(--depth)');
  core.setAttribute('stroke', 'var(--high-sea)');
  core.setAttribute('stroke-width', '2');
  const coreLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  coreLabel.setAttribute('x', String(cx));
  coreLabel.setAttribute('y', String(cy + 5));
  coreLabel.setAttribute('text-anchor', 'middle');
  coreLabel.setAttribute('class', 'orbit-centre__label');
  coreLabel.textContent = 'Adam';
  centre.append(core, coreLabel);
  svg.append(centre);

  host.append(svg, tip, preview);
}

/** Spec §6.5 — urgency as orbital distance; Adam at centre. */
export async function renderOrbitView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading orbit…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);

  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      'Closest bodies are most urgent (due date + priority). Size ≈ effort; colour ≈ domain.'
    )
  );
  const host = el('div', 'orbit-host graph-host');
  canvas.append(host);
  mountOrbit(host, tasks, projects);
}
