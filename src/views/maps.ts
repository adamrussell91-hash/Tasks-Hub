import type { MapColorToken, MapLine, MapStation, MapTick, TransitMap, YearTrack } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { exportMapHtml, pickCurrentYearMap } from '@/domain/maps';
import {
  applyDateSpanToStation,
  applyDateToTickAttach,
  dateToY,
  layoutMap,
  LINE_COLORS,
  lineColorsNeedWriteback,
  moveLine,
  nextLineLetter,
  nextLineX,
  normalizeLineColors,
  schoolTerms,
  wrapEventLines,
  YEAR_TRACKS,
  YEAR_TRACK_LABELS,
  yearLinePoints,
  yToDate,
  type MapCanvasLayout
} from '@/domain/maps-layout';
import { discCss, fillCss, letterCss, strokeCss } from '@/domain/maps-colors';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubToolbar,
  el,
  type HubFilterOption
} from '@/views/hub-kit';

export function mapsOrSeed(maps: TransitMap[] | null | undefined): TransitMap[] {
  const list = maps && maps.length > 0 ? maps : [mindWorks2026Map()];
  return list.map((map) => normalizeLineColors(map));
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

type Mode = 'view' | 'edit';
type DraftKind = 'line' | 'station' | 'event' | null;

function strokeOf(color: MapColorToken): string {
  return strokeCss(color);
}

function fillOf(color: MapColorToken): string {
  return fillCss(color);
}

function findLine(map: TransitMap, id: string): MapLine | undefined {
  return map.lines.find((l) => l.id === id);
}

function lineForTick(map: TransitMap, tick: MapTick | undefined): MapLine | undefined {
  if (!tick) return undefined;
  if (tick.attach.kind === 'line') return findLine(map, tick.attach.line_id);
  if (tick.attach.kind === 'station') {
    const stationId = tick.attach.station_id;
    const station = map.stations.find((item) => item.id === stationId);
    return station ? findLine(map, station.line_id) : undefined;
  }
  const hostId = tick.attach.event_id;
  return lineForTick(
    map,
    map.ticks.find((item) => item.id === hostId)
  );
}

function targetFilterOptions(
  map: TransitMap,
  opts: { includeBlank?: string; skipId?: string | null } = {}
): HubFilterOption[] {
  const options: HubFilterOption[] = [];
  if (opts.includeBlank !== undefined) {
    options.push({ value: '', label: opts.includeBlank });
  }
  for (const item of map.lines) {
    options.push({ value: `line:${item.id}`, label: `Line · ${item.letter} · ${item.name}` });
  }
  for (const item of map.stations) {
    const line = findLine(map, item.line_id);
    options.push({
      value: `station:${item.id}`,
      label: `Station · ${line?.letter ?? '?'} · ${item.label}`
    });
  }
  for (const item of map.ticks) {
    if (item.id === opts.skipId) continue;
    options.push({ value: `event:${item.id}`, label: `Competition · ${item.label}` });
  }
  return options;
}

function attachSelectValue(tick: MapTick): string {
  if (tick.attach.kind === 'station') return `station:${tick.attach.station_id}`;
  if (tick.attach.kind === 'event') return `event:${tick.attach.event_id}`;
  return `line:${tick.attach.line_id}`;
}

function connectSelectValue(map: TransitMap, connectsTo: string | null): string {
  if (!connectsTo) return '';
  const text = connectsTo.toLowerCase();
  const event = map.ticks.find(
    (tick) => tick.id.toLowerCase() === text || tick.label.toLowerCase() === text || text.includes(tick.label.toLowerCase())
  );
  if (event) return `event:${event.id}`;
  const line = map.lines.find(
    (item) => text.includes(item.name.toLowerCase()) || text.includes(item.id.toLowerCase())
  );
  return line ? `line:${line.id}` : '';
}

function parseAttachValue(value: string, fallbackLineId: string, fallbackY: number): MapTick['attach'] {
  const [kind, id] = value.split(':');
  if (kind === 'station' && id) return { kind: 'station', station_id: id, side: 'right', offset: 0.5 };
  if (kind === 'event' && id) return { kind: 'event', event_id: id, side: 'right' };
  return { kind: 'line', line_id: id || fallbackLineId, y: fallbackY };
}

function parseConnectValue(value: string, map: TransitMap): string | null {
  if (!value) return null;
  const [kind, id] = value.split(':');
  if (kind === 'event') return map.ticks.find((tick) => tick.id === id)?.label ?? id ?? null;
  if (kind === 'line') return map.lines.find((item) => item.id === id)?.name ?? null;
  return null;
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

function connectorPath(d: string, color: string, dash: boolean, under = false): SVGPathElement {
  const path = svgEl('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': '3',
    class: under ? 'map-connector map-connector--under' : 'map-connector'
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

function letterFill(color: MapColorToken): string {
  return letterCss(color);
}

function discFill(color: MapColorToken): string {
  return discCss(color);
}

function slideLine(node: SVGElement, prev: number | undefined, x: number): void {
  if (prev == null || prev === x) return;
  node.setAttribute('transform', `translate(${prev - x} 0)`);
  const reset = () => node.setAttribute('transform', 'translate(0 0)');
  requestAnimationFrame(() => requestAnimationFrame(reset));
}

function renderMapSvg(
  host: SVGSVGElement,
  layout: MapCanvasLayout,
  selectedId: string | null,
  showPorts: boolean
): void {
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
    const track = svgEl('g', {
      class: 'map-line-group map-line-group--track',
      'data-line': line.id
    });
    const prev = lastLineX.get(line.id);
    slideLine(track, prev, line.x);
    for (const item of line.tracks) {
      for (const cut of item.cuts) {
        track.append(
          svgEl('line', {
            x1: String(item.x),
            y1: String(cut.y0),
            x2: String(item.x),
            y2: String(cut.y1),
            stroke: color,
            'stroke-width': '8',
            'stroke-linecap': 'butt',
            class: 'map-line'
          })
        );
      }
      const label = svgEl('text', {
        x: String(item.disc.cx),
        y: String(item.disc.cy - item.disc.r - 30),
        'text-anchor': 'middle',
        class: 'map-track-label',
        fill: color
      });
      label.textContent = item.label;
      const disc = svgEl('circle', {
        cx: String(item.disc.cx),
        cy: String(item.disc.cy),
        r: String(item.disc.r),
        fill: discFill(line.color),
        class: 'map-line-disc'
      });
      const letter = svgEl('text', {
        x: String(item.disc.cx),
        y: String(item.disc.cy + 6),
        'text-anchor': 'middle',
        class: 'map-line-letter',
        fill: letterFill(line.color)
      });
      letter.textContent = line.letter;
      track.append(label, disc, letter);
    }
    root.append(track);
  }

  for (const connector of layout.connectors) {
    if (!connector.under) continue;
    localConnectors.add(connector.id);
    root.append(connectorPath(connector.path, strokeOf(connector.color), connector.dash, true));
  }

  for (const line of layout.lines) {
    const group = svgEl('g', {
      class: 'map-line-group',
      'data-line': line.id
    });
    const prev = lastLineX.get(line.id);
    slideLine(group, prev, line.x);
    lastLineX.set(line.id, line.x);

    for (const connector of layout.connectors) {
      if (connector.under) continue;
      const fromLine = ownerLineId(layout, connector.from.ownerId, connector.from.owner);
      const toLine = ownerLineId(layout, connector.to.ownerId, connector.to.owner);
      if (fromLine !== line.id || toLine !== line.id) continue;
      localConnectors.add(connector.id);
      group.append(connectorPath(connector.path, strokeOf(connector.color), connector.dash, false));
    }

    for (const station of layout.stations.filter((item) => item.line_id === line.id)) {
      const stationColor = strokeOf(station.color);
      const g = svgEl('g', {
        class: `map-station${selectedId === station.id ? ' is-selected' : ''}`,
        'data-id': station.id
      });
      for (const body of station.bodies) {
        g.append(
          svgEl('rect', {
            x: String(body.x - body.w / 2),
            y: String(body.y),
            width: String(body.w),
            height: String(body.h),
            rx: String(body.w / 2),
            fill: fillOf(station.color),
            stroke: stationColor,
            'stroke-width': '3.5',
            class: 'map-station__body'
          })
        );
        g.append(verticalText(body.x, body.y + body.h / 2, station.label, 'map-station__label', stationColor));
      }
      if (showPorts) {
        for (const port of station.ports) {
          g.append(portDot(port.x, port.y, port.id, stationColor));
        }
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
        svgEl('circle', {
          cx: String(tick.cx),
          cy: String(tick.cy),
          r: '14',
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
      if (showPorts) {
        for (const port of tick.ports) {
          g.append(portDot(port.x, port.y, port.id, tickColor));
        }
      }
      group.append(g);
    }
    root.append(group);
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

type JoinPick = { kind: 'event' | 'station' | 'line'; id: string };

function clientToMap(svg: SVGSVGElement, event: PointerEvent): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

function hitMap(layout: MapCanvasLayout, x: number, y: number, showPorts: boolean): JoinPick | null {
  if (showPorts) {
    const port = layout.ports.find((item) => Math.hypot(x - item.x, y - item.y) < 12);
    if (port) {
      if (port.owner === 'event') return { kind: 'event', id: port.ownerId };
      if (port.owner === 'station') return { kind: 'station', id: port.ownerId };
      return { kind: 'line', id: port.ownerId };
    }
  }
  for (const tick of layout.ticks) {
    if (Math.hypot(x - tick.cx, y - tick.cy) <= 20) return { kind: 'event', id: tick.id };
    const box = tick.labelBox;
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      return { kind: 'event', id: tick.id };
    }
  }
  for (const station of layout.stations) {
    const hit = station.bodies.some(
      (body) =>
        x >= body.x - body.w / 2 - 6 &&
        x <= body.x + body.w / 2 + 6 &&
        y >= body.y &&
        y <= body.y + body.h
    );
    if (hit) return { kind: 'station', id: station.id };
  }
  for (const line of layout.lines) {
    if (line.tracks.some((track) => Math.hypot(x - track.disc.cx, y - track.disc.cy) <= track.disc.r + 6)) {
      return { kind: 'line', id: line.id };
    }
    if (
      showPorts &&
      line.tracks.some((track) => Math.abs(x - track.x) <= 12 && y >= line.y0 - 8 && y <= line.y1 + 8)
    ) {
      return { kind: 'line', id: line.id };
    }
  }
  return null;
}

function applyJoin(map: TransitMap, from: JoinPick, to: JoinPick, y: number, year: number): boolean {
  if (from.kind === to.kind && from.id === to.id) return false;
  const eventFrom = from.kind === 'event' ? map.ticks.find((tick) => tick.id === from.id) : undefined;
  const eventTo = to.kind === 'event' ? map.ticks.find((tick) => tick.id === to.id) : undefined;
  if (eventFrom && eventTo) {
    eventFrom.connects_to = eventTo.label;
    return true;
  }
  if (eventFrom && to.kind === 'station') {
    eventFrom.attach = { kind: 'station', station_id: to.id, side: 'right', offset: 0.5 };
    return true;
  }
  if (eventFrom && to.kind === 'line') {
    eventFrom.attach = { kind: 'line', line_id: to.id, y };
    eventFrom.starts_on = yToDate(y, year);
    return true;
  }
  if (eventTo && from.kind === 'station') {
    eventTo.attach = { kind: 'station', station_id: from.id, side: 'right', offset: 0.5 };
    return true;
  }
  if (eventTo && from.kind === 'line') {
    eventTo.attach = { kind: 'line', line_id: from.id, y };
    eventTo.starts_on = yToDate(y, year);
    return true;
  }
  return false;
}

function shiftStationDates(station: MapStation, dy: number, year: number): void {
  const startY = station.starts_on ? dateToY(station.starts_on, year) : station.y;
  const endY = station.ends_on ? dateToY(station.ends_on, year) : startY + station.height;
  station.starts_on = yToDate(startY + dy, year);
  station.ends_on = yToDate(endY + dy, year);
  const next = applyDateSpanToStation(station, year);
  station.y = next.y;
  station.height = next.height;
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
  const wrap = el('div', 'map-field');
  wrap.append(el('span', 'map-field__label', label), control);
  return wrap;
}

function textInput(value: string, aria: string) {
  return createHubField({ ariaLabel: aria, value });
}

function dateInput(value: string, aria: string) {
  return createHubField({ type: 'date', ariaLabel: aria, value });
}

function trackPicker(selected: YearTrack[]): { root: HTMLElement; value: () => YearTrack[] } {
  const root = el('div', 'map-tracks');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Year lines');
  const boxes = YEAR_TRACKS.map((track) => {
    const label = el('label', 'map-tracks__item');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = track;
    box.checked = selected.includes(track);
    label.append(box, document.createTextNode(YEAR_TRACK_LABELS[track]));
    root.append(label);
    return box;
  });
  return {
    root,
    value: () => {
      const picked = boxes.filter((box) => box.checked).map((box) => box.value as YearTrack);
      return picked.length ? picked : ['junior'];
    }
  };
}

export async function renderMapsView(canvas: HTMLElement): Promise<void> {
  lastLineX.clear();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading maps…'));
  const [listed, projects] = await Promise.all([
    tasksApi.listMaps().catch(() => [] as TransitMap[]),
    tasksApi.listProjects().catch(() => [] as Project[])
  ]);
  const maps = mapsOrSeed(listed);
  const yearNow = new Date().getFullYear();
  let current = pickCurrentYearMap(maps, yearNow) ?? maps[0]!;
  for (const map of maps) {
    const raw = listed.find((item) => item.id === map.id);
    if (!raw || !lineColorsNeedWriteback(raw, map)) continue;
    void tasksApi
      .updateMap(map.id, { title: map.title, year: map.year, lines: map.lines, stations: map.stations, ticks: map.ticks })
      .then((saved) => {
        const idx = maps.findIndex((item) => item.id === saved.id);
        if (idx >= 0) maps[idx] = saved;
        if (current.id === saved.id) current = saved;
      })
      .catch(() => {
        /* keep the corrected colours on screen even if Blobs write fails */
      });
  }
  let mode: Mode = 'edit';
  let draft: DraftKind = null;
  let selectedId: string | null = null;
  let zoom = 1;
  let camX = 0;
  let camY = 0;
  let joining = false;
  let joinFrom: JoinPick | null = null;
  let toast = '';

  const applyCamera = (svg: SVGSVGElement, layout: MapCanvasLayout) => {
    const vw = layout.width / zoom;
    const vh = layout.height / zoom;
    camX = Math.min(Math.max(0, layout.width - vw), Math.max(0, camX));
    camY = Math.min(Math.max(0, layout.height - vh), Math.max(0, camY));
    svg.setAttribute('viewBox', `${camX} ${camY} ${vw} ${vh}`);
  };

  const excursions = projects.filter((p) => p.type === 'excursion');

  const paint = () => {
    canvas.classList.add('map-page');
    const year = current.year ?? yearNow;
    const terms = schoolTerms(year);
    const layout = layoutMap(current);
    canvas.replaceChildren();
    const toolbar = createHubToolbar('map-toolbar');
    const select = createHubFilter({
      key: 'Map',
      label: 'Map',
      defaultValue: current.id,
      options: maps.map((map) => ({ value: map.id, label: map.title })),
      value: current.id,
      onChange: (value) => {
        const next = maps.find((m) => m.id === value);
        if (next) {
          current = next;
          selectedId = null;
          paint();
        }
      }
    });

    const pills = createHubPills({
      label: 'Map mode',
      items: [
        { id: 'view', label: 'View' },
        { id: 'edit', label: 'Edit' }
      ],
      value: mode,
      onSelect: (id) => {
        mode = id;
        if (id === 'view') {
          draft = null;
          joining = false;
          joinFrom = null;
        }
        paint();
      }
    });

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

    toolbar.append(select.el, pills, exportBtn, newBtn);

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
        joining = false;
        joinFrom = null;
        paint();
      });
      const joinBtn = el('button', joining ? 'btn btn--primary' : 'btn btn--ghost', 'Join');
      joinBtn.type = 'button';
      joinBtn.setAttribute('aria-pressed', joining ? 'true' : 'false');
      joinBtn.addEventListener('click', () => {
        joining = !joining;
        joinFrom = null;
        draft = null;
        toast = joining ? 'Click two things to join them. Ports show only in this mode.' : '';
        paint();
      });
      toolbar.append(addLine, addStation, addEvent, joinBtn);
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
    for (const [index, line] of current.lines.entries()) {
      const item = el('span', 'map-key__item');
      const left = el('button', 'hub-icon-btn', '‹');
      left.type = 'button';
      left.setAttribute('aria-label', `Move ${line.name} left`);
      left.disabled = index === 0;
      const right = el('button', 'hub-icon-btn', '›');
      right.type = 'button';
      right.setAttribute('aria-label', `Move ${line.name} right`);
      right.disabled = index === current.lines.length - 1;
      const shift = (delta: -1 | 1) => {
        current.lines = moveLine(current.lines, line.id, delta);
        paint();
        void persist();
      };
      left.addEventListener('click', () => void shift(-1));
      right.addEventListener('click', () => void shift(1));
      const mark = el('span', 'map-key__disc', line.letter);
      mark.style.background = discFill(line.color);
      mark.style.color = letterFill(line.color);
      if (line.color === 'yellow' || line.color === 'high-sea') {
        mark.style.boxShadow = `inset 0 0 0 2px ${strokeOf(line.color)}`;
      }
      item.append(left, mark, el('span', 'map-key__name', `${line.name} Line`), right);
      key.append(item);
    }
    canvas.append(key);
    const tracksKey = el('p', 'map-key__tracks');
    tracksKey.textContent = 'Each strand has three lines: Junior, Rozelle, and Senior.';
    canvas.append(tracksKey);

    const stage = el('div', `map-stage${joining ? ' is-joining' : ''}${mode === 'edit' ? ' is-edit' : ''}`);
    const svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      preserveAspectRatio: 'xMinYMin slice',
      'aria-label': `${current.title} · ${year} calendar year`
    });
    renderMapSvg(svg, layout, selectedId, joining);
    applyCamera(svg, layout);

    const zoomBar = el('div', 'map-zoom');
    const out = el('button', 'hub-icon-btn', '−');
    const reset = el('button', 'btn btn--ghost', 'Reset');
    const inn = el('button', 'hub-icon-btn', '+');
    out.type = 'button';
    reset.type = 'button';
    inn.type = 'button';
    out.setAttribute('aria-label', 'Zoom out');
    inn.setAttribute('aria-label', 'Zoom in');
    const setZoom = (next: number) => {
      const old = zoom;
      zoom = Math.min(2.2, Math.max(0.5, next));
      const cx = camX + layout.width / old / 2;
      const cy = camY + layout.height / old / 2;
      camX = cx - layout.width / zoom / 2;
      camY = cy - layout.height / zoom / 2;
      applyCamera(svg, layout);
    };
    out.addEventListener('click', () => setZoom(zoom - 0.15));
    inn.addEventListener('click', () => setZoom(zoom + 0.15));
    reset.addEventListener('click', () => {
      zoom = 1;
      camX = 0;
      camY = 0;
      applyCamera(svg, layout);
    });
    zoomBar.append(out, reset, inn);
    stage.append(svg, zoomBar);

    svg.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        setZoom(zoom + (event.deltaY > 0 ? -0.08 : 0.08));
      },
      { passive: false }
    );

    svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const start = clientToMap(svg, event);
      const hit = hitMap(layout, start.x, start.y, joining);
      if (joining) {
        if (!hit) return;
        if (!joinFrom) {
          joinFrom = hit;
          selectedId = hit.kind === 'line' ? null : hit.id;
          toast = `Join from ${hit.kind}. Click the thing to connect.`;
          paint();
          return;
        }
        if (applyJoin(current, joinFrom, hit, start.y, year)) {
          toast = 'Joined.';
          void persist();
        } else {
          toast = 'Could not join those two.';
        }
        joining = false;
        joinFrom = null;
        paint();
        return;
      }

      const canDrag =
        mode === 'edit' && Boolean(hit) && (hit!.kind === 'event' || hit!.kind === 'station' || hit!.kind === 'line');
      let moved = false;
      let lastX = event.clientX;
      let lastY = event.clientY;
      const originX = event.clientX;
      const originY = event.clientY;
      const startCamX = camX;
      const startCamY = camY;
      const rect = svg.getBoundingClientRect();
      const unitX = layout.width / zoom / Math.max(1, rect.width);
      const unitY = layout.height / zoom / Math.max(1, rect.height);
      const dragged = hit && canDrag ? svg.querySelector(`[data-id="${hit.id}"]`) : null;
      const lineGroups = hit?.kind === 'line' ? [...svg.querySelectorAll(`[data-line="${hit.id}"]`)] : [];

      const onMove = (move: PointerEvent) => {
        lastX = move.clientX;
        lastY = move.clientY;
        const dx = lastX - originX;
        const dy = lastY - originY;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        moved = true;
        if (canDrag && hit?.kind === 'line') {
          for (const node of lineGroups) node.setAttribute('transform', `translate(${dx * unitX} 0)`);
          return;
        }
        if (canDrag && dragged) {
          dragged.setAttribute('transform', `translate(0 ${dy * unitY})`);
          return;
        }
        stage.classList.add('is-panning');
        camX = startCamX - dx * unitX;
        camY = startCamY - dy * unitY;
        applyCamera(svg, layout);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        stage.classList.remove('is-panning');
        const dx = (lastX - originX) * unitX;
        const dy = (lastY - originY) * unitY;
        if (!moved) {
          selectedId = hit && hit.kind !== 'line' ? hit.id : null;
          paint();
          return;
        }
        if (!canDrag || !hit) return;
        if (hit.kind === 'line') {
          const lane = layout.lines.length > 1 ? Math.abs(layout.lines[1]!.x - layout.lines[0]!.x) : 280;
          if (Math.abs(dx) >= lane / 2) {
            current.lines = moveLine(current.lines, hit.id, dx > 0 ? 1 : -1);
            void persist();
          }
          paint();
          return;
        }
        if (hit.kind === 'station') {
          const station = current.stations.find((item) => item.id === hit.id);
          if (station) shiftStationDates(station, dy, year);
          selectedId = hit.id;
          void persist();
          paint();
          return;
        }
        const tick = current.ticks.find((item) => item.id === hit.id);
        if (tick) {
          const laid = layout.ticks.find((item) => item.id === tick.id);
          const nextY = (laid?.cy ?? start.y) + dy;
          tick.starts_on = yToDate(nextY, year);
          if (tick.attach.kind === 'line') {
            const nearest = [...layout.lines].sort(
              (a, b) => Math.abs(a.x - (start.x + dx)) - Math.abs(b.x - (start.x + dx))
            )[0];
            tick.attach = { kind: 'line', line_id: nearest?.id ?? tick.attach.line_id, y: nextY };
          }
          const next = applyDateToTickAttach(tick, year);
          tick.attach = next.attach;
          selectedId = hit.id;
          void persist();
        }
        paint();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    canvas.append(stage);

    const preview = el('aside', 'graph-preview map-preview');
    const selectedStation = current.stations.find((s) => s.id === selectedId);
    const selectedTick = current.ticks.find((t) => t.id === selectedId);
    if (selectedStation || selectedTick) {
      preview.hidden = false;
      const kind = selectedStation ? 'Station' : 'Event';
      const item = selectedStation ?? selectedTick!;
      const line = selectedStation
        ? findLine(current, selectedStation.line_id)
        : lineForTick(current, selectedTick);
      preview.append(el('p', 'graph-preview__eyebrow', kind), el('h3', 'graph-preview__title', item.label));
      const dates = [item.starts_on, item.ends_on]
        .filter(Boolean)
        .map((d) => formatDisplayDate(d!))
        .join(' → ');
      preview.append(
        el(
          'p',
          'graph-preview__meta',
          [
            line ? `${line.letter} ${line.name}` : null,
            selectedStation ? selectedStation.tracks.map((track) => YEAR_TRACK_LABELS[track]).join(', ') : null,
            dates || null
          ]
            .filter(Boolean)
            .join(' · ')
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
        const link = createHubFilter({
          key: 'Project',
          label: 'Linked project',
          defaultValue: '',
          options: [
            { value: '', label: 'No project link' },
            ...[...projects.filter((p) => p.type !== 'excursion'), ...excursions].map((project) => ({
              value: `${project.type === 'excursion' ? 'excursion' : 'project'}:${project.id}`,
              label: project.title
            }))
          ],
          value: item.link
            ? `${item.link.type === 'excursion' ? 'excursion' : 'project'}:${item.link.id}`
            : ''
        });
        const attachTo = createHubFilter({
          key: 'Attach',
          label: 'Attach to',
          defaultValue: selectedTick ? attachSelectValue(selectedTick) : '',
          options: selectedTick
            ? targetFilterOptions(current, { skipId: selectedTick.id })
            : [],
          value: selectedTick ? attachSelectValue(selectedTick) : ''
        });
        const also = createHubFilter({
          key: 'Also',
          label: 'Also connect to',
          defaultValue: '',
          options: selectedTick
            ? targetFilterOptions(current, {
                includeBlank: 'No extra connection',
                skipId: selectedTick.id
              })
            : [],
          value: selectedTick ? connectSelectValue(current, selectedTick.connects_to) : ''
        });
        const tracks = selectedStation ? trackPicker(selectedStation.tracks) : null;
        const save = el('button', 'btn btn--primary', 'Save');
        save.type = 'button';
        save.addEventListener('click', async () => {
          item.label = name.input.value.trim() || item.label;
          item.starts_on = start.input.value || null;
          item.ends_on = selectedStation
            ? end.input.value || null
            : end.input.value || start.input.value || null;
          const [type, id] = link.getValue().split(':');
          item.link = id ? { type: type === 'excursion' ? 'excursion' : 'project', id } : null;
          if (selectedStation) {
            selectedStation.tracks = tracks?.value() ?? selectedStation.tracks;
            const next = applyDateSpanToStation(selectedStation, year);
            selectedStation.starts_on = next.starts_on;
            selectedStation.ends_on = next.ends_on;
            selectedStation.y = next.y;
            selectedStation.height = next.height;
          } else if (selectedTick) {
            selectedTick.attach = parseAttachValue(
              attachTo.getValue(),
              current.lines[0]?.id ?? '',
              selectedTick.attach.kind === 'line' ? selectedTick.attach.y : 200
            );
            selectedTick.connects_to = parseConnectValue(also.getValue(), current);
            const next = applyDateToTickAttach(selectedTick, year);
            selectedTick.attach = next.attach;
          }
          await persist();
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
        form.append(name.el);
        form.append(selectedStation ? field('Starts', start.el) : field('Date', start.el));
        if (selectedStation) {
          form.append(field('Ends', end.el));
          if (tracks) form.append(field('Year lines', tracks.root));
        }
        if (selectedTick) {
          form.append(field('Attach to', attachTo.el), field('Also connect to', also.el));
        }
        form.append(link.el, save, del);
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
    station: 'A program on one strand. Pick Junior, Rozelle, and/or Senior. Start and end dates place it on the year.',
    event: 'A competition. Attach it to a line, a station, or another competition’s border.'
  };
  card.append(
    el('p', 'page-header__eyebrow', 'Proposed write'),
    el('h2', 'page-header__title', titles[kind]),
    el('p', 'page-header__supporting', `${copy[kind]} Do not apply until Confirm.`)
  );

  const name = textInput('', 'Name');
  name.input.placeholder =
    kind === 'line' ? 'Justice' : kind === 'station' ? 'Young Diplomats Program' : 'Rotary MUNA';
  const letter = textInput(nextLineLetter(map.lines), 'Letter');
  letter.input.maxLength = 4;
  const color = createHubFilter({
    key: 'Colour',
    label: 'Colour',
    defaultValue: LINE_COLORS[0] ?? 'blue',
    options: LINE_COLORS.map((token) => ({ value: token, label: token.replace('-', ' ') })),
    value: LINE_COLORS[0] ?? 'blue'
  });
  const line = createHubFilter({
    key: 'Line',
    label: 'Line',
    defaultValue: map.lines[0]?.id ?? '',
    options: map.lines.map((item) => ({
      value: item.id,
      label: `${item.letter} · ${item.name}`
    })),
    value: map.lines[0]?.id ?? ''
  });
  const start = dateInput(terms.t1, kind === 'event' ? 'Date' : 'Starts');
  const end = dateInput(terms.e, 'Ends');
  const tracks = trackPicker(['junior']);
  const attachTo = createHubFilter({
    key: 'Attach',
    label: 'Attach to',
    defaultValue: map.lines[0] ? `line:${map.lines[0].id}` : '',
    options: targetFilterOptions(map),
    value: map.lines[0] ? `line:${map.lines[0].id}` : ''
  });
  const also = createHubFilter({
    key: 'Also',
    label: 'Also connect to',
    defaultValue: '',
    options: targetFilterOptions(map, { includeBlank: 'No extra connection' }),
    value: ''
  });

  if (kind === 'line') card.append(field('Name', name.el), field('Letter', letter.el), field('Colour', color.el));
  else if (kind === 'station') {
    card.append(
      field('Name', name.el),
      field('Line', line.el),
      field('Year lines', tracks.root),
      field('Starts', start.el),
      field('Ends', end.el)
    );
  } else {
    card.append(
      field('Name', name.el),
      field('Attach to', attachTo.el),
      field('Also connect to', also.el),
      field('Date', start.el)
    );
  }

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  discard.type = 'button';
  confirm.type = 'button';
  discard.addEventListener('click', () => onCancel());
  confirm.addEventListener('click', () => {
    const title = name.input.value.trim();
    if (!title) {
      host.append(el('p', 'empty-state', 'Add a name.'));
      return;
    }
    if (kind === 'line') {
      const x = nextLineX(map.lines);
      map.lines.push({
        id: newId('line'),
        name: title,
        letter: (letter.input.value.trim() || nextLineLetter(map.lines)).slice(0, 4).toUpperCase(),
        color: (color.getValue() as MapColorToken) || 'blue',
        points: yearLinePoints(x)
      });
    } else if (kind === 'station') {
      if (!map.lines.length) {
        host.append(el('p', 'empty-state', 'Add a line first.'));
        return;
      }
      const draftStation: MapStation = {
        id: newId('st'),
        line_id: line.getValue() || map.lines[0]!.id,
        label: title,
        y: 80,
        height: 110,
        tracks: tracks.value(),
        in_stroke: 'solid',
        out_stroke: 'solid',
        starts_on: start.input.value || terms.t1,
        ends_on: end.input.value || terms.e,
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
        attach: parseAttachValue(attachTo.getValue(), map.lines[0]!.id, 200),
        stroke: 'solid',
        connects_to: parseConnectValue(also.getValue(), map),
        starts_on: start.input.value || terms.t1,
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
