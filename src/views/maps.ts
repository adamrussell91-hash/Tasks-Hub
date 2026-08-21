import type { MapLine, MapStation, MapTick, TransitMap } from '@/schemas/map';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import {
  crossingKind,
  exportMapHtml,
  lineX,
  pickCurrentYearMap,
  segmentCrossings,
  stationLineCuts
} from '@/domain/maps';
import { mindWorks2026Map } from '@/domain/maps-seed';

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

const COLOR_VAR: Record<string, string> = {
  wave: 'var(--wave)',
  success: 'var(--success)',
  lilac: 'var(--pastel-lilac-ink)',
  'high-sea-ink': 'var(--high-sea-ink)',
  marine: 'var(--marine)',
  navy: 'var(--navy)',
  depth: 'var(--depth)'
};

const FILL_VAR: Record<string, string> = {
  wave: 'var(--pastel-blue)',
  success: 'var(--pastel-sage)',
  lilac: 'var(--pastel-lilac)',
  'high-sea-ink': 'var(--pastel-gold)',
  marine: 'var(--pastel-blue)',
  navy: 'var(--pastel-blue)',
  depth: 'var(--pastel-blue)'
};

type Mode = 'view' | 'edit';
type Place = 'idle' | 'line' | 'program' | 'competition';

function lineColor(line: MapLine): string {
  return COLOR_VAR[line.color] ?? 'var(--wave)';
}

function lineFill(line: MapLine): string {
  return FILL_VAR[line.color] ?? 'var(--pastel-blue)';
}

function findLine(map: TransitMap, id: string): MapLine | undefined {
  return map.lines.find((l) => l.id === id);
}

function nearestLine(map: TransitMap, x: number, y: number): MapLine | null {
  let best: MapLine | null = null;
  let dist = 22;
  for (const line of map.lines) {
    const lx = lineX(line);
    const yMin = Math.min(...line.points.map((p) => p.y));
    const yMax = Math.max(...line.points.map((p) => p.y));
    if (y < yMin - 10 || y > yMax + 10) continue;
    const d = Math.abs(x - lx);
    if (d < dist) {
      dist = d;
      best = line;
    }
  }
  return best;
}

function nearestStation(map: TransitMap, x: number, y: number): MapStation | null {
  for (const station of map.stations) {
    const line = findLine(map, station.line_id);
    if (!line) continue;
    const lx = lineX(line);
    if (x >= lx - 32 && x <= lx + 32 && y >= station.y && y <= station.y + station.height) {
      return station;
    }
  }
  return null;
}

function nearestTick(map: TransitMap, x: number, y: number): MapTick | null {
  for (const tick of map.ticks) {
    const pos = tickPosition(map, tick);
    if (!pos) continue;
    if (Math.hypot(x - pos.cx, y - pos.cy) < 14) return tick;
  }
  return null;
}

function tickPosition(map: TransitMap, tick: MapTick): { x0: number; y0: number; cx: number; cy: number } | null {
  if (tick.attach.kind === 'line') {
    const line = findLine(map, tick.attach.line_id);
    if (!line) return null;
    const x0 = lineX(line);
    const y0 = tick.attach.y;
    return { x0, y0, cx: x0 + 48, cy: y0 };
  }
  const attach = tick.attach;
  if (attach.kind !== 'station') return null;
  const station = map.stations.find((s) => s.id === attach.station_id);
  if (!station) return null;
  const line = findLine(map, station.line_id);
  if (!line) return null;
  const x0 = lineX(line) + (attach.side === 'left' ? -28 : 28);
  const y0 = station.y + station.height * attach.offset;
  const dir = attach.side === 'left' ? -1 : 1;
  return { x0, y0, cx: x0 + dir * 40, cy: y0 };
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function renderMapSvg(
  host: SVGSVGElement,
  map: TransitMap,
  selectedId: string | null
): void {
  host.replaceChildren();
  const root = svgEl('g', { class: 'map-root' });
  const crossings = segmentCrossings(map.lines, map.stations);
  const tunnels = crossings.filter((c) => crossingKind(c, map.stations) === 'tunnel');

  for (const line of map.lines) {
    const color = lineColor(line);
    const stations = map.stations.filter((s) => s.line_id === line.id);
    const cuts = stationLineCuts(line, stations);
    const lx = lineX(line);
    for (const cut of cuts) {
      const gaps = tunnels.filter((t) => Math.abs(t.point.x - lx) < 1 && t.point.y > cut.y0 && t.point.y < cut.y1);
      const ys = [cut.y0, ...gaps.map((g) => g.point.y), cut.y1].sort((a, b) => a - b);
      for (let i = 0; i < ys.length - 1; i += 1) {
        const y0 = ys[i]!;
        const y1 = ys[i + 1]!;
        if (gaps.some((g) => g.point.y === y0 || g.point.y === y1) && y1 - y0 < 16) {
          continue;
        }
        if (gaps.some((g) => Math.abs(g.point.y - (y0 + y1) / 2) < 8)) continue;
        const path = svgEl('line', {
          x1: String(lx),
          y1: String(y0),
          x2: String(lx),
          y2: String(y1),
          stroke: color,
          'stroke-width': '8',
          class: 'map-line'
        });
        root.append(path);
      }
    }

    const letter = svgEl('text', {
      x: String(lx),
      y: '28',
      'text-anchor': 'middle',
      class: 'map-line-letter'
    });
    letter.textContent = line.letter;
    root.append(letter);
  }

  for (const station of map.stations) {
    const line = findLine(map, station.line_id);
    if (!line) continue;
    const lx = lineX(line);
    const g = svgEl('g', {
      class: `map-station${selectedId === station.id ? ' is-selected' : ''}`,
      'data-id': station.id
    });
    g.append(
      svgEl('rect', {
        x: String(lx - 28),
        y: String(station.y),
        width: '56',
        height: String(station.height),
        rx: '28',
        fill: lineFill(line),
        stroke: lineColor(line),
        'stroke-width': '4',
        class: 'map-station__body'
      })
    );
    const label = svgEl('text', {
      x: String(lx),
      y: String(station.y + station.height / 2),
      'text-anchor': 'middle',
      class: 'map-station__label'
    });
    label.textContent = station.label;
    g.append(label);
    root.append(g);
  }

  for (const tick of map.ticks) {
    const pos = tickPosition(map, tick);
    const attach = tick.attach;
    const line =
      attach.kind === 'line'
        ? findLine(map, attach.line_id)
        : findLine(
            map,
            map.stations.find((s) => attach.kind === 'station' && s.id === attach.station_id)?.line_id ??
              ''
          );
    if (!pos || !line) continue;
    const color = lineColor(line);
    const g = svgEl('g', {
      class: `map-tick${selectedId === tick.id ? ' is-selected' : ''}`,
      'data-id': tick.id
    });
    const stem = svgEl('line', {
      x1: String(pos.x0),
      y1: String(pos.y0),
      x2: String(pos.cx),
      y2: String(pos.cy),
      stroke: color,
      'stroke-width': '3',
      class: 'map-tick__stem'
    });
    if (tick.stroke === 'dotted') stem.setAttribute('stroke-dasharray', '4 3');
    g.append(
      stem,
      svgEl('circle', {
        cx: String(pos.cx),
        cy: String(pos.cy),
        r: '7',
        fill: 'var(--paper)',
        stroke: color,
        'stroke-width': '3'
      })
    );
    const label = svgEl('text', {
      x: String(pos.cx + 10),
      y: String(pos.cy - 4),
      class: 'map-tick__label',
      transform: `rotate(-32 ${pos.cx + 10} ${pos.cy - 4})`
    });
    label.textContent = tick.label;
    g.append(label);
    if (tick.connects_to) {
      const note = svgEl('text', {
        x: String(pos.cx + 10),
        y: String(pos.cy + 18),
        class: 'map-tick__note'
      });
      note.textContent = tick.connects_to;
      g.append(note);
    }
    root.append(g);
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
}

export async function renderMapsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading maps…'));
  const [listed, projects] = await Promise.all([
    tasksApi.listMaps().catch(() => [] as TransitMap[]),
    tasksApi.listProjects().catch(() => [] as Project[])
  ]);
  const maps = mapsOrSeed(listed);
  const year = new Date().getFullYear();
  let current = pickCurrentYearMap(maps, year) ?? maps[0]!;
  let mode: Mode = 'edit';
  let place: Place = 'idle';
  let selectedId: string | null = null;
  let zoom = 1;
  let toast = '';

  const excursions = projects.filter((p) => p.type === 'excursion');

  const paint = () => {
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
      place = 'idle';
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
      const created = await tasksApi.createMap({ title: 'Untitled map' });
      maps.push(created);
      current = created;
      mode = 'edit';
      paint();
    });

    toolbar.append(select, pills, exportBtn, newBtn);

    if (mode === 'edit') {
      const addLine = el('button', 'btn btn--ghost', '+ Line');
      const addProg = el('button', 'btn btn--ghost', '+ Program');
      const addComp = el('button', 'btn btn--ghost', '+ Competition');
      addLine.type = 'button';
      addProg.type = 'button';
      addComp.type = 'button';
      addLine.addEventListener('click', () => {
        place = 'line';
      });
      addProg.addEventListener('click', () => {
        place = 'program';
      });
      addComp.addEventListener('click', () => {
        place = 'competition';
      });
      toolbar.append(addLine, addProg, addComp);
    }
    canvas.append(toolbar);

    const stage = el('div', 'map-stage');
    const svg = svgEl('svg', {
      class: 'map-svg',
      viewBox: '0 0 900 1100',
      'aria-label': current.title
    });
    renderMapSvg(svg, current, selectedId);
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

    svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoom = Math.min(2.2, Math.max(0.5, zoom + (event.deltaY > 0 ? -0.08 : 0.08)));
      const g = svg.querySelector('.map-root');
      if (g) g.setAttribute('transform', `scale(${zoom})`);
    }, { passive: false });

    const toMapPoint = (event: PointerEvent) => {
      const pt = svg.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const loc = pt.matrixTransform(ctm.inverse());
      return { x: loc.x / zoom, y: loc.y / zoom };
    };

    svg.addEventListener('pointerdown', (event) => {
      const { x, y } = toMapPoint(event);
      if (mode === 'edit' && place === 'line') {
        const nx = Math.round(x / 20) * 20;
        current.lines.push({
          id: newId('line'),
          name: 'New line',
          letter: 'N',
          color: 'wave',
          points: [
            { x: nx, y: 40 },
            { x: nx, y: 1040 }
          ]
        });
        place = 'idle';
        void persist();
        paint();
        return;
      }
      if (mode === 'edit' && place === 'program') {
        const line = nearestLine(current, x, y);
        if (line) {
          current.stations.push({
            id: newId('st'),
            line_id: line.id,
            label: 'New program',
            y: Math.round(y - 44),
            height: 88,
            in_stroke: 'solid',
            out_stroke: 'solid',
            link: null
          });
          place = 'idle';
          void persist();
          paint();
        }
        return;
      }
      if (mode === 'edit' && place === 'competition') {
        const station = nearestStation(current, x, y);
        const line = nearestLine(current, x, y);
        if (station) {
          current.ticks.push({
            id: newId('tk'),
            label: 'New competition',
            attach: { kind: 'station', station_id: station.id, side: x >= lineX(findLine(current, station.line_id)!) ? 'right' : 'left', offset: 0.5 },
            stroke: 'solid',
            connects_to: null,
            link: null
          });
        } else if (line) {
          current.ticks.push({
            id: newId('tk'),
            label: 'New competition',
            attach: { kind: 'line', line_id: line.id, y },
            stroke: 'solid',
            connects_to: null,
            link: null
          });
        }
        place = 'idle';
        void persist();
        paint();
        return;
      }

      const tick = nearestTick(current, x, y);
      const station = nearestStation(current, x, y);
      selectedId = tick?.id ?? station?.id ?? null;
      paint();
    });

    canvas.append(stage);

    const preview = el('aside', 'graph-preview map-preview');
    const selectedStation = current.stations.find((s) => s.id === selectedId);
    const selectedTick = current.ticks.find((t) => t.id === selectedId);
    if (selectedStation || selectedTick) {
      preview.hidden = false;
      const kind = selectedStation ? 'Program' : 'Competition';
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
      preview.append(el('p', 'graph-preview__meta', line ? `On ${line.name}` : item.id));
      const linked = item.link
        ? projects.find((p) => p.id === item.link!.id)
        : null;
      if (linked) {
        const open = el('p', 'graph-preview__meta', `Open linked project → ${linked.title}`);
        preview.append(open);
      }

      if (mode === 'edit') {
        const form = el('div', 'map-drawer');
        const name = document.createElement('input');
        name.className = 'hub-search';
        name.value = item.label;
        name.setAttribute('aria-label', 'Name');
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
          const [type, id] = link.value.split(':');
          item.link = id ? { type: type === 'excursion' ? 'excursion' : 'project', id } : null;
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
        form.append(name, link, save, del);
        preview.append(form);
      }
    } else {
      preview.hidden = true;
    }
    canvas.append(preview);

    const confirmHost = el('div', 'map-confirm');
    canvas.append(confirmHost);
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
