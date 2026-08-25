import type { MapColorToken, MapLine, MapStation, MapTick, TransitMap, YearTrack } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { projectPageHash } from '@/domain/cards';
import { tasksApi } from '@/services/client-api';
import { exportMapHtml, pickCurrentYearMap } from '@/domain/maps';
import { createFilteredPicker, createMapIndex, type MapIndexItem, type PickerGroup } from '@/views/map-nav';
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

export function mapsOrSeed(maps: TransitMap[] | null | undefined): TransitMap[] {
  const list = maps && maps.length > 0 ? maps : [mindWorks2026Map()];
  return list.map((map) => normalizeLineColors(map));
}

/** Hide rail + page header so the map can fill the viewport. */
export function setMapFullscreenChrome(on: boolean): void {
  document.documentElement.classList.toggle('is-map-fullscreen', on);
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

function targetPickerGroups(map: TransitMap, skipId?: string | null): PickerGroup[] {
  return [
    {
      label: 'Lines',
      options: map.lines.map((item) => ({
        value: `line:${item.id}`,
        label: `${item.letter} · ${item.name}`
      }))
    },
    {
      label: 'Stations',
      options: map.stations.map((item) => {
        const line = findLine(map, item.line_id);
        return {
          value: `station:${item.id}`,
          label: `${line?.letter ?? '?'} · ${item.label}`
        };
      })
    },
    {
      label: 'Competitions',
      options: map.ticks
        .filter((item) => item.id !== skipId)
        .map((item) => ({ value: `event:${item.id}`, label: item.label }))
    }
  ];
}

function projectLinkGroups(projects: Project[], excursions: Project[]): PickerGroup[] {
  return [
    {
      label: 'Projects',
      options: projects
        .filter((project) => project.type !== 'excursion')
        .map((project) => ({
          value: `project:${project.id}`,
          label: project.title
        }))
    },
    {
      label: 'Excursions',
      options: excursions.map((project) => ({
        value: `excursion:${project.id}`,
        label: project.title
      }))
    }
  ];
}

function projectLinkValue(link: MapStation['link'] | MapTick['link']): string {
  if (!link) return '';
  return `${link.type === 'excursion' ? 'excursion' : 'project'}:${link.id}`;
}

function buildMapIndexItems(
  map: TransitMap,
  layout: MapCanvasLayout
): MapIndexItem[] {
  const items: MapIndexItem[] = [];
  for (const station of map.stations) {
    const line = findLine(map, station.line_id);
    const laid = layout.stations.find((item) => item.id === station.id);
    items.push({
      id: station.id,
      kind: 'station',
      label: station.label,
      group: line ? `${line.letter} · ${line.name}` : 'Programs',
      y: laid ? laid.y + laid.h / 2 : station.y
    });
  }
  for (const tick of map.ticks) {
    const line = lineForTick(map, tick);
    const laid = layout.ticks.find((item) => item.id === tick.id);
    items.push({
      id: tick.id,
      kind: 'event',
      label: tick.label,
      group: line ? `${line.letter} · competitions` : 'Competitions',
      y: laid?.cy ?? 200
    });
  }
  return items.sort((a, b) => a.y - b.y || a.label.localeCompare(b.label));
}

function focusCameraOnY(layout: MapCanvasLayout, targetY: number, zoom: number): number {
  const viewH = layout.height / zoom;
  return Math.max(0, Math.min(layout.height - viewH, targetY - viewH / 3));
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

function connectorPath(
  id: string,
  d: string,
  color: string,
  dash: boolean,
  under = false
): SVGPathElement {
  const path = svgEl('path', {
    d,
    fill: 'none',
    stroke: color,
    'stroke-width': '3',
    class: under ? 'map-connector map-connector--under' : 'map-connector',
    'data-connector-id': id
  });
  if (dash) path.setAttribute('stroke-dasharray', '5 4');
  return path;
}

function patchConnectorPathY(d: string, dy: number, shiftFrom: boolean, shiftTo: boolean): string {
  if (!dy || (!shiftFrom && !shiftTo)) return d;
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
  if (!nums || nums.length < 4) return d;
  const next = [...nums];
  if (shiftFrom) next[1] = (next[1] ?? 0) + dy;
  if (shiftTo) next[next.length - 1] = (next[next.length - 1] ?? 0) + dy;
  let index = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, () => String(next[index++] ?? 0));
}

function connectorRefs(
  svg: SVGSVGElement,
  layout: MapCanvasLayout,
  ownerId: string
): Array<{ els: NodeListOf<Element>; shiftFrom: boolean; shiftTo: boolean; base: string }> {
  return layout.connectors
    .filter((connector) => connector.from.ownerId === ownerId || connector.to.ownerId === ownerId)
    .map((connector) => ({
      base: connector.path,
      shiftFrom: connector.from.ownerId === ownerId,
      shiftTo: connector.to.ownerId === ownerId,
      els: svg.querySelectorAll(`[data-connector-id="${connector.id}"]`)
    }));
}

function liveShiftConnectors(
  refs: Array<{ els: NodeListOf<Element>; shiftFrom: boolean; shiftTo: boolean; base: string }>,
  dy: number
): void {
  for (const ref of refs) {
    const next = patchConnectorPathY(ref.base, dy, ref.shiftFrom, ref.shiftTo);
    ref.els.forEach((node) => node.setAttribute('d', next));
  }
}

function ownerLineId(layout: MapCanvasLayout, ownerId: string, owner: string): string | null {
  if (owner === 'line') return ownerId;
  if (owner === 'station') return layout.stations.find((item) => item.id === ownerId)?.line_id ?? null;
  return layout.ticks.find((item) => item.id === ownerId)?.lineId ?? null;
}

const DRAG_THRESHOLD = 4;

type MapHit =
  | JoinPick
  | { kind: 'station-resize'; id: string; edge: 'top' | 'bottom' }
  | null;

function letterFill(color: MapColorToken): string {
  return letterCss(color);
}

function discFill(color: MapColorToken): string {
  return discCss(color);
}

function renderMapSvg(
  host: SVGSVGElement,
  layout: MapCanvasLayout,
  selectedId: string | null,
  showPorts: boolean,
  editMode: boolean
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
    root.append(
      connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash, true)
    );
  }

  for (const line of layout.lines) {
    const group = svgEl('g', {
      class: 'map-line-group',
      'data-line': line.id
    });

    for (const connector of layout.connectors) {
      if (connector.under) continue;
      const fromLine = ownerLineId(layout, connector.from.ownerId, connector.from.owner);
      const toLine = ownerLineId(layout, connector.to.ownerId, connector.to.owner);
      if (fromLine !== line.id || toLine !== line.id) continue;
      localConnectors.add(connector.id);
      group.append(
        connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash, false)
      );
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
        if (editMode) {
          g.append(
            svgEl('rect', {
              x: String(body.x - body.w / 2),
              y: String(body.y),
              width: String(body.w),
              height: '10',
              class: 'map-station__resize map-station__resize--top',
              'data-resize': 'top'
            }),
            svgEl('rect', {
              x: String(body.x - body.w / 2),
              y: String(body.y + body.h - 10),
              width: String(body.w),
              height: '10',
              class: 'map-station__resize map-station__resize--bottom',
              'data-resize': 'bottom'
            })
          );
        }
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
      connectorPath(connector.id, connector.path, strokeOf(connector.color), connector.dash),
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

function hitMap(
  layout: MapCanvasLayout,
  x: number,
  y: number,
  showPorts: boolean,
  editMode: boolean
): MapHit {
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
    for (const body of station.bodies) {
      const left = body.x - body.w / 2 - 6;
      const right = body.x + body.w / 2 + 6;
      const top = body.y;
      const bottom = body.y + body.h;
      if (x < left || x > right || y < top || y > bottom) continue;
      if (editMode) {
        if (y <= top + 10) return { kind: 'station-resize', id: station.id, edge: 'top' };
        if (y >= bottom - 10) return { kind: 'station-resize', id: station.id, edge: 'bottom' };
      }
      return { kind: 'station', id: station.id };
    }
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

function resizeStationDates(
  station: MapStation,
  dy: number,
  edge: 'top' | 'bottom',
  year: number
): void {
  const startY = station.starts_on ? dateToY(station.starts_on, year) : station.y;
  const endY = station.ends_on ? dateToY(station.ends_on, year) : startY + station.height;
  const minSpan = 14;
  if (edge === 'top') {
    station.starts_on = yToDate(Math.min(startY + dy, endY - minSpan), year);
  } else {
    station.ends_on = yToDate(Math.max(endY + dy, startY + minSpan), year);
  }
  const next = applyDateSpanToStation(station, year);
  station.y = next.y;
  station.height = next.height;
  station.starts_on = next.starts_on;
  station.ends_on = next.ends_on;
}

function joinPick(hit: MapHit): JoinPick | null {
  if (!hit || hit.kind === 'station-resize') return null;
  return hit;
}

function hitOwnerId(hit: MapHit): string | null {
  if (!hit) return null;
  return hit.id;
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
  const input = textInput('', aria);
  input.type = 'date';
  input.value = value;
  return input;
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
  let mode: Mode = 'view';
  let fullscreen = false;
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

  const applyFullscreen = (on: boolean) => {
    fullscreen = on;
    setMapFullscreenChrome(on);
  };

  const leaveFullscreen = () => {
    if (!fullscreen) return;
    applyFullscreen(false);
    paint();
  };

  const onFullscreenKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !fullscreen) return;
    event.preventDefault();
    leaveFullscreen();
  };

  const onFullscreenHash = () => {
    if (location.hash.startsWith('#/maps')) return;
    applyFullscreen(false);
    window.removeEventListener('keydown', onFullscreenKey);
    window.removeEventListener('hashchange', onFullscreenHash);
  };

  window.addEventListener('keydown', onFullscreenKey);
  window.addEventListener('hashchange', onFullscreenHash);
  setMapFullscreenChrome(false);

  const excursions = projects.filter((p) => p.type === 'excursion');

  const paint = () => {
    canvas.classList.toggle('map-page', true);
    canvas.classList.toggle('map-page--fullscreen', fullscreen);
    setMapFullscreenChrome(fullscreen);
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
      joining = false;
      joinFrom = null;
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

    const fullBtn = el(
      'button',
      fullscreen ? 'btn btn--primary' : 'btn btn--ghost',
      fullscreen ? 'Exit full screen' : 'Full screen'
    );
    fullBtn.type = 'button';
    fullBtn.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
    fullBtn.addEventListener('click', () => {
      applyFullscreen(!fullscreen);
      paint();
    });

    toolbar.append(select, pills, exportBtn, newBtn, fullBtn);

    const termPills = el('div', 'hub-pills map-term-pills');
    termPills.setAttribute('role', 'group');
    termPills.setAttribute('aria-label', 'Jump to term');
    for (const term of layout.terms) {
      const btn = el('button', 'hub-pills__btn', term.label);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        camY = focusCameraOnY(layout, term.y, zoom);
        paint();
      });
      termPills.append(btn);
    }
    toolbar.append(termPills);

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

    const body = el('div', 'map-body');
    const stage = el('div', `map-stage${joining ? ' is-joining' : ''}${mode === 'edit' ? ' is-edit' : ''}`);
    const svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${layout.width} ${layout.height}`,
      preserveAspectRatio: 'xMinYMin slice',
      'aria-label': `${current.title} · ${year} calendar year`
    });
    renderMapSvg(svg, layout, selectedId, joining, mode === 'edit');
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

    const indexItems = buildMapIndexItems(current, layout);
    const index = createMapIndex(indexItems, selectedId, (item) => {
      selectedId = item.id;
      camY = focusCameraOnY(layout, item.y, zoom);
      paint();
    });
    body.append(stage, index);

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
      event.preventDefault();
      const start = clientToMap(svg, event);
      const hit = hitMap(layout, start.x, start.y, joining, mode === 'edit' && !joining);
      if (joining) {
        const joinHit = joinPick(hit);
        if (!joinHit) return;
        if (!joinFrom) {
          joinFrom = joinHit;
          selectedId = joinHit.kind === 'line' ? null : joinHit.id;
          toast = `Join from ${joinHit.kind}. Click the thing to connect.`;
          paint();
          return;
        }
        if (applyJoin(current, joinFrom, joinHit, start.y, year)) {
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

      const dragKind =
        mode === 'edit' && hit
          ? hit.kind === 'station-resize'
            ? 'resize-station'
            : hit.kind === 'event' || hit.kind === 'station' || hit.kind === 'line'
              ? `move-${hit.kind}`
              : null
          : null;
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
      const ownerId = hitOwnerId(hit);
      const dragged =
        ownerId && dragKind?.startsWith('move-') && hit?.kind !== 'line'
          ? svg.querySelector(`[data-id="${ownerId}"]`)
          : null;
      const lineGroups =
        hit?.kind === 'line' ? [...svg.querySelectorAll(`[data-line="${hit.id}"]`)] : [];
      const connectorLinks =
        ownerId && dragKind && dragKind !== 'move-line' ? connectorRefs(svg, layout, ownerId) : [];
      const resizeEdge = hit?.kind === 'station-resize' ? hit.edge : null;
      const resizeStation =
        resizeEdge && ownerId ? (svg.querySelector(`[data-id="${ownerId}"]`) as SVGGElement | null) : null;
      const resizeBodies = resizeStation ? [...resizeStation.querySelectorAll('.map-station__body')] : [];
      const resizeBase = resizeBodies.map((body) => ({
        y: Number(body.getAttribute('y') ?? 0),
        h: Number(body.getAttribute('height') ?? 0)
      }));

      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      const onMove = (move: PointerEvent) => {
        move.preventDefault();
        lastX = move.clientX;
        lastY = move.clientY;
        const dx = lastX - originX;
        const dy = lastY - originY;
        if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        if (!moved) {
          moved = true;
          stage.classList.add('is-dragging');
          if (dragKind === 'move-line') {
            for (const node of lineGroups) node.classList.add('is-live-drag');
          }
          dragged?.classList.add('is-live-drag');
        }
        const mapDy = dy * unitY;
        const mapDx = dx * unitX;
        if (dragKind === 'move-line') {
          for (const node of lineGroups) node.setAttribute('transform', `translate(${mapDx} 0)`);
          return;
        }
        if (dragKind === 'resize-station' && resizeStation && resizeEdge) {
          for (const [index, body] of resizeBodies.entries()) {
            const base = resizeBase[index];
            if (!base) continue;
            if (resizeEdge === 'top') {
              body.setAttribute('y', String(base.y + mapDy));
              body.setAttribute('height', String(Math.max(14, base.h - mapDy)));
            } else {
              body.setAttribute('height', String(Math.max(14, base.h + mapDy)));
            }
          }
          liveShiftConnectors(connectorLinks, mapDy);
          return;
        }
        if (dragged) {
          dragged.setAttribute('transform', `translate(0 ${mapDy})`);
          liveShiftConnectors(connectorLinks, mapDy);
          return;
        }
        stage.classList.add('is-panning');
        camX = startCamX - mapDx;
        camY = startCamY - mapDy;
        applyCamera(svg, layout);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        stage.classList.remove('is-panning', 'is-dragging');
        for (const node of lineGroups) node.classList.remove('is-live-drag');
        dragged?.classList.remove('is-live-drag');
        try {
          stage.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        const dx = (lastX - originX) * unitX;
        const dy = (lastY - originY) * unitY;
        if (!moved) {
          selectedId = hit && hit.kind !== 'line' && hit.kind !== 'station-resize' ? hit.id : null;
          paint();
          return;
        }
        if (!dragKind || !hit) return;
        if (hit.kind === 'line') {
          const lane = layout.lines.length > 1 ? Math.abs(layout.lines[1]!.x - layout.lines[0]!.x) : 280;
          if (Math.abs(dx) >= lane / 2) {
            current.lines = moveLine(current.lines, hit.id, dx > 0 ? 1 : -1);
            void persist();
          }
          paint();
          return;
        }
        if (hit.kind === 'station-resize') {
          const station = current.stations.find((item) => item.id === hit.id);
          if (station) resizeStationDates(station, dy, hit.edge, year);
          selectedId = hit.id;
          void persist();
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
      window.addEventListener('pointerup', onUp, { once: true });
    });

    canvas.append(body);

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
        const actions = el('div', 'map-preview__actions');
        const open = el('button', 'btn btn--secondary', `Open ${linked.title}`);
        open.type = 'button';
        open.addEventListener('click', () => {
          location.hash = projectPageHash(linked.id);
        });
        const gantt = el('button', 'btn btn--ghost', 'Gantt');
        gantt.type = 'button';
        gantt.addEventListener('click', () => {
          location.hash = `#/gantt?project=${encodeURIComponent(linked.id)}`;
        });
        const branch = el('button', 'btn btn--ghost', 'Branch');
        branch.type = 'button';
        branch.addEventListener('click', () => {
          location.hash = `#/branch?project=${encodeURIComponent(linked.id)}`;
        });
        actions.append(open, gantt, branch);
        preview.append(actions);
      }

      if (selectedTick?.connects_to) {
        const connected =
          current.ticks.find(
            (tick) =>
              tick.label === selectedTick.connects_to ||
              tick.id === selectedTick.connects_to ||
              tick.label.toLowerCase().includes(selectedTick.connects_to!.toLowerCase())
          ) ?? null;
        if (connected) {
          const jump = el('button', 'btn btn--ghost', `Connected → ${connected.label}`);
          jump.type = 'button';
          jump.addEventListener('click', () => {
            selectedId = connected.id;
            const laid = layout.ticks.find((entry) => entry.id === connected.id);
            if (laid) camY = focusCameraOnY(layout, laid.cy, zoom);
            paint();
          });
          preview.append(jump);
        } else {
          preview.append(
            el('p', 'graph-preview__meta', `Connects to ${selectedTick.connects_to}`)
          );
        }
      }

      if (mode === 'edit') {
        const form = el('div', 'map-drawer');
        const name = textInput(item.label, 'Name');
        const start = dateInput(item.starts_on ?? terms.t1, 'Starts');
        const end = dateInput(item.ends_on ?? item.starts_on ?? terms.e, 'Ends');
        const linkPicker = createFilteredPicker(
          projectLinkGroups(projects, excursions),
          projectLinkValue(item.link),
          { ariaLabel: 'Project link', blankLabel: 'No project link', placeholder: 'Search projects…' }
        );
        const attachPicker = selectedTick
          ? createFilteredPicker(targetPickerGroups(current, selectedTick.id), attachSelectValue(selectedTick), {
              ariaLabel: 'Attach to',
              placeholder: 'Search lines, stations…'
            })
          : null;
        const alsoPicker = selectedTick
          ? createFilteredPicker(targetPickerGroups(current, selectedTick.id), connectSelectValue(current, selectedTick.connects_to), {
              ariaLabel: 'Also connect to',
              blankLabel: 'No extra connection',
              placeholder: 'Search connections…'
            })
          : null;
        const tracks = selectedStation ? trackPicker(selectedStation.tracks) : null;
        const save = el('button', 'btn btn--primary', 'Save');
        save.type = 'button';
        save.addEventListener('click', async () => {
          item.label = name.value.trim() || item.label;
          item.starts_on = start.value || null;
          item.ends_on = selectedStation ? end.value || null : end.value || start.value || null;
          const [type, id] = linkPicker.getValue().split(':');
          item.link = id ? { type: type === 'excursion' ? 'excursion' : 'project', id } : null;
          if (selectedStation) {
            selectedStation.tracks = tracks?.value() ?? selectedStation.tracks;
            const next = applyDateSpanToStation(selectedStation, year);
            selectedStation.starts_on = next.starts_on;
            selectedStation.ends_on = next.ends_on;
            selectedStation.y = next.y;
            selectedStation.height = next.height;
          } else if (selectedTick && attachPicker && alsoPicker) {
            selectedTick.attach = parseAttachValue(
              attachPicker.getValue(),
              current.lines[0]?.id ?? '',
              selectedTick.attach.kind === 'line' ? selectedTick.attach.y : 200
            );
            selectedTick.connects_to = parseConnectValue(alsoPicker.getValue(), current);
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
        form.append(name);
        form.append(selectedStation ? field('Starts', start) : field('Date', start));
        if (selectedStation) {
          form.append(field('Ends', end));
          if (tracks) form.append(field('Year lines', tracks.root));
        }
        form.append(field('Project link', linkPicker.root));
        if (selectedTick && attachPicker && alsoPicker) {
          form.append(field('Attach to', attachPicker.root), field('Also connect to', alsoPicker.root));
        }
        form.append(save, del);
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
  const tracks = trackPicker(['junior']);
  const attachPicker = createFilteredPicker(
    targetPickerGroups(map),
    map.lines[0] ? `line:${map.lines[0].id}` : '',
    { ariaLabel: 'Attach to', placeholder: 'Search lines, stations…' }
  );
  const alsoPicker = createFilteredPicker(targetPickerGroups(map), '', {
    ariaLabel: 'Also connect to',
    blankLabel: 'No extra connection',
    placeholder: 'Search connections…'
  });

  if (kind === 'line') card.append(field('Name', name), field('Letter', letter), field('Colour', color));
  else if (kind === 'station') {
    card.append(
      field('Name', name),
      field('Line', line),
      field('Year lines', tracks.root),
      field('Starts', start),
      field('Ends', end)
    );
  } else {
    card.append(field('Name', name), field('Attach to', attachPicker.root), field('Also connect to', alsoPicker.root), field('Date', start));
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
        color: (color.value as MapColorToken) || 'blue',
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
        tracks: tracks.value(),
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
        attach: parseAttachValue(attachPicker.getValue(), map.lines[0]!.id, 200),
        stroke: 'solid',
        connects_to: parseConnectValue(alsoPicker.getValue(), map),
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
