import type { MapColorToken, MapLine, MapStation, MapTick, TransitMap } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { exportMapHtml, pickCurrentYearMap } from '@/domain/maps';
import {
  applyDateSpanToStation,
  applyDateToTickAttach,
  layoutMap,
  LINE_COLORS,
  nextLineLetter,
  nextLineX,
  schoolTerms,
  wrapEventLines,
  yearLinePoints,
  type MapCanvasLayout
} from '@/domain/maps-layout';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export function mapsOrSeed(maps: TransitMap[] | null | undefined): TransitMap[] {
  return maps && maps.length > 0 ? maps : [mindWorks2026Map()];
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

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

const STROKE_VAR: Record<MapColorToken, string> = {
  wave: 'var(--wave)',
  success: 'var(--success)',
  lilac: 'var(--pastel-lilac-ink)',
  'high-sea-ink': 'var(--high-sea-ink)',
  marine: 'var(--marine)',
  navy: 'var(--navy)',
  depth: 'var(--depth)'
};

const FILL_VAR: Record<MapColorToken, string> = {
  wave: 'var(--pastel-blue)',
  success: 'var(--pastel-sage)',
  lilac: 'var(--pastel-lilac)',
  'high-sea-ink': 'var(--pastel-gold)',
  marine: 'var(--pastel-blue)',
  navy: 'var(--pastel-blue)',
  depth: 'var(--pastel-blue)'
};

type Mode = 'view' | 'edit';
type DraftKind = 'line' | 'station' | 'event' | null;

function strokeOf(color: MapColorToken): string {
  return STROKE_VAR[color];
}

function fillOf(color: MapColorToken): string {
  return FILL_VAR[color];
}

function findLine(map: TransitMap, id: string): MapLine | undefined {
  return map.lines.find((l) => l.id === id);
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function verticalText(
  x: number,
  y: number,
  label: string,
  className: string,
  fill: string
): SVGTextElement {
  const text = svgEl('text', {
    x: String(x),
    y: String(y),
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    transform: `rotate(-90 ${x} ${y})`,
    class: className,
    fill
  });
  text.textContent = label;
  return text;
}

function horizontalText(
  x: number,
  y: number,
  label: string,
  className: string,
  fill: string,
  boxH: number
): SVGTextElement {
  const lines = wrapEventLines(label);
  const text = svgEl('text', {
    x: String(x),
    y: String(y),
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    class: className,
    fill
  });
  if (lines.length === 1) {
    text.textContent = lines[0]!;
    return text;
  }
  const lineH = 16;
  const start = y - ((lines.length - 1) * lineH) / 2;
  for (const [index, line] of lines.entries()) {
    const tspan = svgEl('tspan', {
      x: String(x),
      y: String(start + index * lineH)
    });
    tspan.textContent = line;
    text.append(tspan);
  }
  void boxH;
  return text;
}

function diamondPath(cx: number, cy: number, r: number): string {
  return `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`;
}

function portDot(x: number, y: number, id: string, color: string): SVGCircleElement {
  return svgEl('circle', {
    cx: String(x),
    cy: String(y),
    r: '4',
    fill: 'var(--paper)',
    stroke: color,
    class: 'map-port',
    'data-port': id
  });
}

function connectorPath(d: string, color: string, dash: boolean): SVGPathElement {
  const path = svgEl('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': '3',
    class: 'map-connector'
  });
  if (dash) path.setAttribute('stroke-dasharray', '5 4');
  return path;
}

function ownerLineId(layout: MapCanvasLayout, ownerId: string, owner: string): string | null {
  if (owner === 'line') return ownerId;
  if (owner === 'station') return layout.stations.find((item) => item.id === ownerId)?.line_id ?? null;
  return layout.ticks.find((item) => item.id === ownerId)?.lineId ?? null;
}

const lastLineX = new Map<string, number>();

function renderMapSvg(host: SVGSVGElement, layout: MapCanvasLayout, selectedId: string | null): void {
  host.replaceChildren();
  host.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
  const root = svgEl('g', { class: 'map-root' });

  for (const term of layout.terms) {
    root.append(
      svgEl('line', {
        x1: '72',
        y1: String(term.y),
        x2: String(layout.width - 24),
        y2: String(term.y),
        class: 'map-term__rule'
      })
    );
    const disc = svgEl('g', { class: 'map-term' });
    disc.append(
      svgEl('circle', {
        cx: '36',
        cy: String(term.y),
        r: '15',
        class: 'map-term__disc'
      })
    );
    const label = svgEl('text', {
      x: '36',
      y: String(term.y + 5),
      'text-anchor': 'middle',
      class: 'map-term__label'
    });
    label.textContent = term.label;
    disc.append(label);
    root.append(disc);
  }

  const localConnectors = new Set<string>();
  for (const line of layout.lines) {
    const color = strokeOf(line.color);
    const group = svgEl('g', {
      class: 'map-line-group',
      'data-line': line.id
    });
    const prev = lastLineX.get(line.id);
    if (prev != null && prev !== line.x) {
      group.setAttribute('transform', `translate(${prev - line.x} 0)`);
    }
    lastLineX.set(line.id, line.x);
    group.append(
      svgEl('line', {
        x1: String(line.x),
        y1: String(line.y0),
        x2: String(line.x),
        y2: String(line.y1),
        stroke: color,
        'stroke-width': '8',
        class: 'map-line'
      })
    );
    const head = svgEl('g', { class: 'map-line-head' });
    head.append(
      svgEl('circle', {
        cx: String(line.disc.cx),
        cy: String(line.disc.cy),
        r: String(line.disc.r),
        fill: color,
        class: 'map-line-disc'
      })
    );
    const letter = svgEl('text', {
      x: String(line.disc.cx),
      y: String(line.disc.cy + 8),
      'text-anchor': 'middle',
      class: 'map-line-letter',
      fill: 'var(--paper)'
    });
    letter.textContent = line.letter;
    head.append(letter);
    group.append(head);

    for (const connector of layout.connectors) {
      const fromLine = ownerLineId(layout, connector.from.ownerId, connector.from.owner);
      const toLine = ownerLineId(layout, connector.to.ownerId, connector.to.owner);
      if (fromLine !== line.id || toLine !== line.id) continue;
      localConnectors.add(connector.id);
      group.append(connectorPath(connector.path, strokeOf(connector.color), connector.dash));
    }

    for (const station of layout.stations.filter((item) => item.line_id === line.id)) {
      const stationColor = strokeOf(station.color);
      const g = svgEl('g', {
        class: `map-station${selectedId === station.id ? ' is-selected' : ''}`,
        'data-id': station.id
      });
      if (station.lane > 0) {
        g.append(
          svgEl('path', {
            d: `M ${station.lineX} ${station.y} H ${station.x} V ${station.y + 18}`,
            fill: 'none',
            stroke: stationColor,
            'stroke-width': '6',
            class: 'map-station__jog'
          })
        );
      }
      g.append(
        svgEl('rect', {
          x: String(station.x - station.w / 2),
          y: String(station.y),
          width: String(station.w),
          height: String(station.h),
          rx: '14',
          fill: fillOf(station.color),
          stroke: stationColor,
          'stroke-width': '3.5',
          class: 'map-station__body'
        })
      );
      g.append(
        verticalText(station.x, station.y + station.h / 2, station.label, 'map-station__label', stationColor)
      );
      for (const port of station.ports) {
        g.append(portDot(port.x, port.y, port.id, stationColor));
      }
      group.append(g);
    }

    for (const tick of layout.ticks.filter((item) => item.lineId === line.id)) {
      const tickColor = strokeOf(tick.color);
      const g = svgEl('g', {
        class: `map-tick${selectedId === tick.id ? ' is-selected' : ''}`,
        'data-id': tick.id
      });
      g.append(
        svgEl('path', {
          d: diamondPath(tick.cx, tick.cy, 14),
          fill: 'var(--paper)',
          stroke: tickColor,
          'stroke-width': '3.5',
          class: 'map-tick__mark'
        })
      );
      g.append(
        svgEl('rect', {
          x: String(tick.labelBox.x),
          y: String(tick.labelBox.y),
          width: String(tick.labelBox.w),
          height: String(tick.labelBox.h),
          rx: '8',
          class: 'map-tick__chip'
        })
      );
      g.append(
        horizontalText(
          tick.labelBox.x + tick.labelBox.w / 2,
          tick.labelBox.y + tick.labelBox.h / 2,
          tick.label,
          'map-tick__label',
          tickColor,
          tick.labelBox.h
        )
      );
      for (const port of tick.ports) {
        g.append(portDot(port.x, port.y, port.id, tickColor));
      }
      group.append(g);
    }
    root.append(group);
    if (prev != null && prev !== line.x) {
      requestAnimationFrame(() => {
        group.setAttribute('transform', 'translate(0 0)');
      });
    }
  }

  for (const connector of layout.connectors) {
    if (localConnectors.has(connector.id)) continue;
    root.insertBefore(
      connectorPath(connector.path, strokeOf(connector.color), connector.dash),
      root.querySelector('.map-line-group')
    );
  }

  host.append(root);
}

function downloadHtml(map: TransitMap): void {
  const blob = new Blob([exportMapHtml(map)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.title.replace(/\s+/g, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function showConfirm(host: HTMLElement, summary: string, onConfirm: () => Promise<void>): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('aria-label', 'Confirm delete');
  card.append(
    el('p', 'page-header__eyebrow', 'Proposed write'),
    el('h2', 'page-header__title', 'Delete'),
    el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`)
  );
  const actions = el('div', 'confirm-card__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  cancel.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    await onConfirm();
    host.replaceChildren();
  });
  actions.append(cancel, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'map-field');
  wrap.append(el('span', 'map-field__label', label), control);
  return wrap;
}

function textInput(value: string, aria: string): HTMLInputElement {
  const input = el('input', 'hub-search') as HTMLInputElement;
  input.value = value;
  input.setAttribute('aria-label', aria);
  return input;
}

function dateInput(value: string, aria: string): HTMLInputElement {
  const input = textInput(value, aria);
  input.type = 'date';
  return input;
}

export async function renderMapsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading maps…'));
  const [listed, projects] = await Promise.all([
    tasksApi.listMaps().catch(() => [] as TransitMap[]),
    tasksApi.listProjects().catch(() => [] as Project[])
  ]);
  const maps = mapsOrSeed(listed);
  const yearNow = new Date().getFullYear();
  let current = pickCurrentYearMap(maps, yearNow) ?? maps[0]!;
  let mode: Mode = 'edit';
  let draft: DraftKind = null;
  let selectedId: string | null = null;
  let zoom = 1;
  let toast = '';

  const excursions = projects.filter((p) => p.type === 'excursion');

  const paint = () => {
    const year = current.year ?? yearNow;
    const terms = schoolTerms(year);
    const layout = layoutMap(current);
    canvas.replaceChildren();
    const toolbar = el('div', 'map-toolbar');
    const select = el('select', 'hub-filter') as HTMLSelectElement;
    select.setAttribute('aria-label', 'Map');
    for (const map of maps) {
      const opt = document.createElement('option');
      opt.value = map.id;
      opt.textContent = map.title;
      if (map.id === current.id) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => {
      const next = maps.find((m) => m.id === select.value);
      if (next) {
        current = next;
        selectedId = null;
        paint();
      }
    });

    const pills = el('div', 'hub-pills');
    pills.setAttribute('role', 'group');
    const viewBtn = el('button', `hub-pills__btn${mode === 'view' ? ' is-active' : ''}`, 'View');
    const editBtn = el('button', `hub-pills__btn${mode === 'edit' ? ' is-active' : ''}`, 'Edit');
    viewBtn.type = 'button';
    editBtn.type = 'button';
    viewBtn.addEventListener('click', () => {
      mode = 'view';
      draft = null;
      paint();
    });
    editBtn.addEventListener('click', () => {
      mode = 'edit';
      paint();
    });
    pills.append(viewBtn, editBtn);

    const exportBtn = el('button', 'btn btn--secondary', 'Export');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', () => downloadHtml(current));

    const newBtn = el('button', 'btn btn--primary', 'New map');
    newBtn.type = 'button';
    newBtn.addEventListener('click', async () => {
      const created = await tasksApi.createMap({ title: 'Untitled map', year });
      maps.push(created);
      current = created;
      mode = 'edit';
      paint();
    });

    toolbar.append(select, pills, exportBtn, newBtn);

    if (mode === 'edit') {
      const addLine = el('button', draft === 'line' ? 'btn btn--primary' : 'btn btn--ghost', '+ Line');
      const addStation = el(
        'button',
        draft === 'station' ? 'btn btn--primary' : 'btn btn--ghost',
        '+ Station'
      );
      const addEvent = el('button', draft === 'event' ? 'btn btn--primary' : 'btn btn--ghost', '+ Event');
      addLine.type = 'button';
      addStation.type = 'button';
      addEvent.type = 'button';
      addLine.addEventListener('click', () => {
        draft = draft === 'line' ? null : 'line';
        paint();
      });
      addStation.addEventListener('click', () => {
        draft = draft === 'station' ? null : 'station';
        paint();
      });
      addEvent.addEventListener('click', () => {
        draft = draft === 'event' ? null : 'event';
        paint();
      });
      toolbar.append(addLine, addStation, addEvent);
    }
    canvas.append(toolbar);

    const confirmHost = el('div', 'map-confirm');
    canvas.append(confirmHost);
    if (mode === 'edit' && draft) {
      renderDraftForm(
        confirmHost,
        current,
        year,
        terms,
        draft,
        (next) => {
          current = next;
          draft = null;
          void persist();
          paint();
        },
        () => {
          draft = null;
          paint();
        }
      );
    }

    const key = el('div', 'map-key');
    key.setAttribute('aria-label', 'Map key');
    for (const line of current.lines) {
      const item = el('span', 'map-key__item');
      const mark = el('span', 'map-key__disc', line.letter);
      mark.style.background = strokeOf(line.color);
      item.append(mark, el('span', 'map-key__name', `${line.name} Line`));
      key.append(item);
    }
    canvas.append(key);

    const stage = el('div', 'map-stage');
    const svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      'aria-label': `${current.title} · ${year} calendar year`
    });
    renderMapSvg(svg, layout, selectedId);
    const root = svg.querySelector('.map-root');
    if (root) (root as SVGGElement).setAttribute('transform', `scale(${zoom})`);

    const zoomBar = el('div', 'map-zoom');
    const out = el('button', 'hub-icon-btn', '−');
    const reset = el('button', 'btn btn--ghost', 'Reset');
    const inn = el('button', 'hub-icon-btn', '+');
    out.type = 'button';
    reset.type = 'button';
    inn.type = 'button';
    out.setAttribute('aria-label', 'Zoom out');
    inn.setAttribute('aria-label', 'Zoom in');
    out.addEventListener('click', () => {
      zoom = Math.max(0.5, zoom - 0.15);
      paint();
    });
    inn.addEventListener('click', () => {
      zoom = Math.min(2.2, zoom + 0.15);
      paint();
    });
    reset.addEventListener('click', () => {
      zoom = 1;
      paint();
    });
    zoomBar.append(out, reset, inn);
    stage.append(svg, zoomBar);

    svg.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        zoom = Math.min(2.2, Math.max(0.5, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
        const g = svg.querySelector('.map-root');
        if (g) g.setAttribute('transform', `scale(${zoom})`);
      },
      { passive: false }
    );

    svg.addEventListener('pointerdown', (event) => {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = pt.matrixTransform(ctm.inverse());
      const x = loc.x / zoom;
      const y = loc.y / zoom;
      const tick = layout.ticks.find((item) => Math.hypot(x - item.cx, y - item.cy) < 16);
      const station = layout.stations.find(
        (item) =>
          x >= item.x - item.w / 2 - 6 &&
          x <= item.x + item.w / 2 + 6 &&
          y >= item.y &&
          y <= item.y + item.h
      );
      selectedId = tick?.id ?? station?.id ?? null;
      paint();
    });

    canvas.append(stage);

    const preview = el('aside', 'graph-preview map-preview');
    const selectedStation = current.stations.find((s) => s.id === selectedId);
    const selectedTick = current.ticks.find((t) => t.id === selectedId);
    if (selectedStation || selectedTick) {
      preview.hidden = false;
      const kind = selectedStation ? 'Station' : 'Event';
      const item = selectedStation ?? selectedTick!;
      const tickAttach = selectedTick?.attach;
      const line = selectedStation
        ? findLine(current, selectedStation.line_id)
        : tickAttach?.kind === 'line'
          ? findLine(current, tickAttach.line_id)
          : findLine(
              current,
              current.stations.find((s) => tickAttach?.kind === 'station' && s.id === tickAttach.station_id)
                ?.line_id ?? ''
            );
      preview.append(el('p', 'graph-preview__eyebrow', kind), el('h3', 'graph-preview__title', item.label));
      const dates = [item.starts_on, item.ends_on]
        .filter(Boolean)
        .map((d) => formatDisplayDate(d!))
        .join(' → ');
      preview.append(
        el(
          'p',
          'graph-preview__meta',
          [line ? `${line.letter} ${line.name}` : null, dates || null].filter(Boolean).join(' · ')
        )
      );
      const linked = item.link ? projects.find((p) => p.id === item.link!.id) : null;
      if (linked) {
        preview.append(el('p', 'graph-preview__meta', `Linked project → ${linked.title}`));
      }

      if (mode === 'edit') {
        const form = el('div', 'map-drawer');
        const name = textInput(item.label, 'Name');
        const start = dateInput(item.starts_on ?? terms.t1, 'Starts');
        const end = dateInput(item.ends_on ?? item.starts_on ?? terms.e, 'Ends');
        const link = document.createElement('select');
        link.className = 'hub-filter';
        const none = document.createElement('option');
        none.value = '';
        none.textContent = 'No project link';
        link.append(none);
        for (const project of [...projects.filter((p) => p.type !== 'excursion'), ...excursions]) {
          const opt = document.createElement('option');
          opt.value = `${project.type === 'excursion' ? 'excursion' : 'project'}:${project.id}`;
          opt.textContent = project.title;
          if (item.link?.id === project.id) opt.selected = true;
          link.append(opt);
        }
        const save = el('button', 'btn btn--primary', 'Save');
        save.type = 'button';
        save.addEventListener('click', () => {
          item.label = name.value.trim() || item.label;
          item.starts_on = start.value || null;
          item.ends_on = selectedStation ? end.value || null : end.value || start.value || null;
          const [type, id] = link.value.split(':');
          item.link = id ? { type: type === 'excursion' ? 'excursion' : 'project', id } : null;
          if (selectedStation) {
            const next = applyDateSpanToStation(selectedStation, year);
            selectedStation.y = next.y;
            selectedStation.height = next.height;
          } else if (selectedTick) {
            const next = applyDateToTickAttach(selectedTick, year);
            selectedTick.attach = next.attach;
          }
          void persist();
          paint();
        });
        const del = el('button', 'btn btn--ghost', 'Delete');
        del.type = 'button';
        del.addEventListener('click', () => {
          showConfirm(confirmHost, `Remove “${item.label}”.`, async () => {
            current.stations = current.stations.filter((s) => s.id !== item.id);
            current.ticks = current.ticks.filter((t) => t.id !== item.id);
            selectedId = null;
            await persist();
            paint();
          });
        });
        form.append(name);
        form.append(selectedStation ? field('Starts', start) : field('Date', start));
        if (selectedStation) form.append(field('Ends', end));
        form.append(link, save, del);
        preview.append(form);
      }
    } else {
      preview.hidden = true;
    }
    canvas.append(preview);
    if (toast) canvas.append(el('p', 'canvas-status', toast));
  };

  async function persist(): Promise<void> {
    try {
      const saved = await tasksApi.updateMap(current.id, {
        title: current.title,
        year: current.year,
        lines: current.lines,
        stations: current.stations,
        ticks: current.ticks
      });
      const idx = maps.findIndex((m) => m.id === saved.id);
      if (idx >= 0) maps[idx] = saved;
      current = saved;
      toast = '';
    } catch {
      toast = 'Could not save — last good map is still on screen.';
      paint();
    }
  }

  paint();
}

function renderDraftForm(
  host: HTMLElement,
  map: TransitMap,
  year: number,
  terms: ReturnType<typeof schoolTerms>,
  kind: Exclude<DraftKind, null>,
  onApply: (map: TransitMap) => void,
  onCancel: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Add to map');
  const titles = { line: 'Add line', station: 'Add station', event: 'Add event' };
  const copy = {
    line: 'A new vertical line for the calendar year, from T1 through E.',
    station: 'A program on one line. Start and end dates place it on the year.',
    event: 'A competition or one-off. The date is the station on the year.'
  };
  card.append(
    el('p', 'page-header__eyebrow', 'Proposed write'),
    el('h2', 'page-header__title', titles[kind]),
    el('p', 'page-header__supporting', `${copy[kind]} Do not apply until Confirm.`)
  );

  const name = textInput('', 'Name');
  name.placeholder = kind === 'line' ? 'Justice' : kind === 'station' ? 'Young Diplomats Program' : 'Rotary MUNA';
  const letter = textInput(nextLineLetter(map.lines), 'Letter');
  letter.maxLength = 4;
  const color = el('select', 'hub-filter') as HTMLSelectElement;
  color.setAttribute('aria-label', 'Colour');
  for (const token of LINE_COLORS) {
    const opt = document.createElement('option');
    opt.value = token;
    opt.textContent = token.replace('-', ' ');
    color.append(opt);
  }
  const line = el('select', 'hub-filter') as HTMLSelectElement;
  line.setAttribute('aria-label', 'Line');
  for (const item of map.lines) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.letter} · ${item.name}`;
    line.append(opt);
  }
  const start = dateInput(terms.t1, kind === 'event' ? 'Date' : 'Starts');
  const end = dateInput(terms.e, 'Ends');

  if (kind === 'line') card.append(field('Name', name), field('Letter', letter), field('Colour', color));
  else if (kind === 'station') {
    card.append(field('Name', name), field('Line', line), field('Starts', start), field('Ends', end));
  } else {
    card.append(field('Name', name), field('Line', line), field('Date', start));
  }

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  discard.type = 'button';
  confirm.type = 'button';
  discard.addEventListener('click', () => onCancel());
  confirm.addEventListener('click', () => {
    const title = name.value.trim();
    if (!title) {
      host.append(el('p', 'empty-state', 'Add a name.'));
      return;
    }
    if (kind === 'line') {
      const x = nextLineX(map.lines);
      map.lines.push({
        id: newId('line'),
        name: title,
        letter: (letter.value.trim() || nextLineLetter(map.lines)).slice(0, 4).toUpperCase(),
        color: (color.value as MapColorToken) || 'navy',
        points: yearLinePoints(x)
      });
    } else if (kind === 'station') {
      if (!map.lines.length) {
        host.append(el('p', 'empty-state', 'Add a line first.'));
        return;
      }
      const draftStation: MapStation = {
        id: newId('st'),
        line_id: line.value || map.lines[0]!.id,
        label: title,
        y: 80,
        height: 110,
        in_stroke: 'solid',
        out_stroke: 'solid',
        starts_on: start.value || terms.t1,
        ends_on: end.value || terms.e,
        link: null
      };
      map.stations.push(applyDateSpanToStation(draftStation, year));
    } else {
      if (!map.lines.length) {
        host.append(el('p', 'empty-state', 'Add a line first.'));
        return;
      }
      const draftTick: MapTick = {
        id: newId('tk'),
        label: title,
        attach: { kind: 'line', line_id: line.value || map.lines[0]!.id, y: 200 },
        stroke: 'solid',
        connects_to: null,
        starts_on: start.value || terms.t1,
        ends_on: null,
        link: null
      };
      map.ticks.push(applyDateToTickAttach(draftTick, year));
    }
    onApply(map);
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
