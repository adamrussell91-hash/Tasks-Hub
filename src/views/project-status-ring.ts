import type { LifecycleMixSlice } from '@/domain/projects-pulse';
import { el } from '@/views/hub-kit';

export type ProjectStatusRingOptions = {
  /** SVG width/height in px. Default 132 (Projects view size). */
  size?: number;
  /** Smaller stroke and caption for dashboard tiles. */
  compact?: boolean;
  /** Wrap the ring in a link (e.g. to #/projects). */
  href?: string;
  /** Show a compact legend beside the ring. Default true when compact. */
  legend?: boolean;
};

function ringGeometry(size: number, compact: boolean): { cx: number; cy: number; r: number; stroke: number } {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = compact ? 10 : 14;
  const r = size / 2 - stroke - (compact ? 6 : 8);
  return { cx, cy, r, stroke };
}

/** Read-only lifecycle mix ring — same visual language as Projects status chart. */
export function renderProjectStatusRing(
  mix: LifecycleMixSlice[],
  options: ProjectStatusRingOptions = {}
): HTMLElement {
  const size = options.size ?? 132;
  const compact = options.compact ?? size <= 100;
  const showLegend = options.legend ?? compact;
  const total = mix.reduce((sum, slice) => sum + slice.count, 0);
  const active = mix.filter((slice) => slice.count > 0);

  const wrap = el('div', compact ? 'project-status-ring project-status-ring--compact' : 'project-status-ring');
  const { cx, cy, r, stroke } = ringGeometry(size, compact);
  const circ = 2 * Math.PI * r;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'project-status-ring__svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    total
      ? active.map((slice) => `${slice.count} ${slice.label}`).join(', ')
      : 'No projects yet'
  );

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', String(cx));
  track.setAttribute('cy', String(cy));
  track.setAttribute('r', String(r));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', 'var(--shore)');
  track.setAttribute('stroke-width', String(stroke));
  svg.append(track);

  let offset = 0;
  for (const slice of mix) {
    if (!slice.count || !total) continue;
    const length = (slice.count / total) * circ;
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arc.setAttribute('cx', String(cx));
    arc.setAttribute('cy', String(cy));
    arc.setAttribute('r', String(r));
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', slice.color);
    arc.setAttribute('stroke-width', String(stroke));
    arc.setAttribute('stroke-linecap', 'butt');
    arc.setAttribute('stroke-dasharray', `${length} ${circ - length}`);
    arc.setAttribute('stroke-dashoffset', String(-offset));
    arc.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    svg.append(arc);
    offset += length;
  }

  const countY = compact ? cy - 2 : cy - 4;
  const captionY = compact ? cy + 12 : cy + 14;
  const count = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  count.setAttribute('x', String(cx));
  count.setAttribute('y', String(countY));
  count.setAttribute('text-anchor', 'middle');
  count.setAttribute('class', 'project-status-ring__total');
  count.textContent = String(total);
  const caption = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  caption.setAttribute('x', String(cx));
  caption.setAttribute('y', String(captionY));
  caption.setAttribute('text-anchor', 'middle');
  caption.setAttribute('class', 'project-status-ring__caption');
  caption.textContent = compact ? 'proj' : 'projects';
  svg.append(count, caption);

  const ringHost = options.href ? document.createElement('a') : el('div', 'project-status-ring__figure');
  if (options.href) {
    ringHost.className = 'project-status-ring__figure project-status-ring__figure--link';
    (ringHost as HTMLAnchorElement).href = options.href;
    ringHost.setAttribute('aria-label', 'Open Projects portfolio');
  }
  ringHost.append(svg);

  if (showLegend && active.length) {
    const legend = el('div', 'project-status-ring__legend');
    for (const slice of active) {
      const row = el('div', 'project-status-ring__legend-row');
      const swatch = el('span', 'project-status-ring__swatch');
      swatch.style.background = slice.color;
      row.append(
        swatch,
        el('span', 'project-status-ring__legend-label', slice.label),
        el('span', 'project-status-ring__legend-count', String(slice.count))
      );
      legend.append(row);
    }
    wrap.append(ringHost, legend);
  } else {
    wrap.append(ringHost);
  }

  return wrap;
}
