import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { buildProjectGanttRows, formatTick, layoutGantt, type GanttLayout } from '@/domain/gantt';
import { createHubFilter } from '../../design-kit/js/hub-filter-menu.js';
import { renderTaskEditor } from '@/views/task-editor';

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

function paintChart(host: HTMLElement, layout: GanttLayout): void {
  host.replaceChildren();
  const svg = svgEl('svg', {
    class: 'gantt-svg',
    width: layout.totalWidth,
    height: layout.totalHeight + 28,
    viewBox: `0 0 ${layout.totalWidth} ${layout.totalHeight + 28}`,
    role: 'img',
    'aria-label': 'Project Gantt chart'
  });

  // Today marker
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOff = Math.round((today.getTime() - layout.rangeStart.getTime()) / (24 * 60 * 60 * 1000));
  if (todayOff >= 0 && todayOff < layout.dayCount) {
    const x = layout.labelWidth + todayOff * layout.dayWidth + layout.dayWidth / 2;
    svg.append(
      svgEl('line', {
        x1: x,
        y1: 24,
        x2: x,
        y2: layout.totalHeight + 24,
        class: 'gantt-today'
      })
    );
  }

  // Axis ticks
  for (const tick of layout.ticks) {
    const off = Math.round(
      (tick.getTime() - layout.rangeStart.getTime()) / (24 * 60 * 60 * 1000)
    );
    const x = layout.labelWidth + off * layout.dayWidth;
    svg.append(
      svgEl('line', {
        x1: x,
        y1: 24,
        x2: x,
        y2: layout.totalHeight + 24,
        class: 'gantt-grid'
      })
    );
    const label = svgEl('text', {
      x: x + 4,
      y: 16,
      class: 'gantt-tick'
    });
    label.textContent = formatTick(tick);
    svg.append(label);
  }

  // Dependency edges (behind bars)
  for (const edge of layout.edges) {
    const midX = (edge.x1 + edge.x2) / 2;
    const path = svgEl('path', {
      d: `M ${edge.x1} ${edge.y1 + 24} C ${midX} ${edge.y1 + 24}, ${midX} ${edge.y2 + 24}, ${edge.x2} ${edge.y2 + 24}`,
      class: 'gantt-edge',
      fill: 'none'
    });
    svg.append(path);
  }

  // Rows
  for (const bar of layout.bars) {
    const label = svgEl('text', {
      x: 8,
      y: bar.y + 24 + 12,
      class: 'gantt-row-label'
    });
    label.textContent =
      (bar.row.kind === 'milestone' ? '◆ ' : '') + bar.row.label.slice(0, 28);
    svg.append(label);

    if (bar.row.kind === 'milestone') {
      const cx = bar.x + 8;
      const cy = bar.y + 24 + 10;
      svg.append(
        svgEl('polygon', {
          points: `${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`,
          class: 'gantt-milestone'
        })
      );
    } else {
      const rect = svgEl('rect', {
        x: bar.x,
        y: bar.y + 24,
        width: bar.width,
        height: 20,
        rx: 6,
        class: `gantt-bar gantt-bar--${bar.row.status}`
      });
      svg.append(rect);
      const title = svgEl('title');
      title.textContent = `${bar.row.label} · ${bar.row.status}`;
      rect.append(title);
    }
  }

  host.append(svg);
}

/** Project-scoped Gantt with dependency lines (spec §6.1 / step 4). */
export async function renderGanttView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading Gantt…'));
  const [tasks, projects] = await Promise.all([tasksApi.listTasks(), tasksApi.listProjects()]);
  const datedProjects = projects.filter((p) =>
    buildProjectGanttRows(p, tasks).length > 0
  );

  canvas.replaceChildren();

  if (!datedProjects.length) {
    canvas.append(
      el('p', 'empty-state', 'No project has dated tasks or milestones yet. Add due dates on project tasks.')
    );
    return;
  }

  const toolbar = el('div', 'gantt-toolbar');
  let projectId = datedProjects[0]!.id;
  const projectFilter = createHubFilter({
    key: 'Project',
    label: 'Project',
    defaultValue: datedProjects[0]!.id,
    options: datedProjects.map((project) => ({
      value: project.id,
      label: `${project.title} (${project.type})`
    })),
    value: projectId,
    onChange: (value) => {
      projectId = value;
      const project = datedProjects.find((p) => p.id === projectId);
      if (project) paint(project);
    }
  });
  toolbar.append(projectFilter.el);
  canvas.append(toolbar);

  const legend = el('div', 'gantt-legend');
  legend.append(
    el('span', 'chip', 'task bar'),
    el('span', 'chip chip--muted', '◆ milestone'),
    el('span', 'chip chip--muted', 'curve = blocked by')
  );
  canvas.append(legend);

  const host = el('div', 'gantt-host');
  canvas.append(host);

  const paint = (project: Project) => {
    const rows = buildProjectGanttRows(project, tasks);
    const layout = layoutGantt(rows);
    if (!layout) {
      host.replaceChildren(el('p', 'empty-state', 'Nothing dated on this project.'));
      return;
    }
    paintChart(host, layout);
    const table = el('table', 'viz-alt viz-alt--table');
    table.setAttribute('aria-label', `Gantt rows for ${project.title}`);
    const body = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      tr.append(
        el('th', undefined, row.label),
        el('td', undefined, row.kind),
        el('td', undefined, row.status)
      );
      if (row.kind === 'task') {
        tr.tabIndex = 0;
        tr.setAttribute('role', 'button');
        const open = () => {
          const task = tasks.find((t) => t.id === row.id);
          if (task) renderTaskEditor(host, task, projects, () => void renderGanttView(canvas));
        };
        tr.addEventListener('click', open);
        tr.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        });
      }
      body.append(tr);
    }
    table.append(body);
    host.append(table);
  };

  paint(datedProjects[0]!);
}
