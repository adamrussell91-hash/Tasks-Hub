import type { MapColorToken, MapLine, MapStation, MapTick, Point, TransitMap } from '@/schemas/map';
import { parseDue, toDateKey } from '@/domain/queries';

export function lineX(line: { points: Point[] }): number {
  return line.points[0]?.x ?? 0;
}

export const MAP_YEAR_TOP = 168;
export const MAP_YEAR_BOTTOM = 1380;
export const MAP_LEFT = 88;
export const MAP_LINE_GAP = 320;
export const MAP_FIRST_LINE_X = 260;
export const MAP_DISC_R = 30;
export const MAP_STATION_W = 52;
export const MAP_TICK_R = 14;
export const MAP_LABEL_PAD = 20;
export const MAP_PORT_GAP = 72;
export const MAP_EVENT_STEM = 76;
export const MAP_CHIP_PAD = 6;
export const MAP_LINE_STROKE = 8;

export type TermId = 'T1' | 'T2' | 'T3' | 'T4' | 'E';
export type PortSide = 'left' | 'right' | 'top' | 'bottom';
export type PortOwner = 'station' | 'event' | 'line';

export type TermBand = {
  id: TermId;
  label: string;
  date: string;
  y: number;
};

export type LabelBox = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ConnectorPort = {
  id: string;
  ownerId: string;
  owner: PortOwner;
  side: PortSide;
  index: number;
  x: number;
  y: number;
};

export type LaidConnector = {
  id: string;
  from: ConnectorPort;
  to: ConnectorPort;
  path: string;
  color: MapColorToken;
  dash: boolean;
};

export type LaidLine = {
  id: string;
  name: string;
  letter: string;
  color: MapColorToken;
  x: number;
  y0: number;
  y1: number;
  disc: { cx: number; cy: number; r: number };
};

export type LaidStation = {
  id: string;
  line_id: string;
  label: string;
  color: MapColorToken;
  lineX: number;
  x: number;
  y: number;
  w: number;
  h: number;
  lane: number;
  weeks: number;
  ports: ConnectorPort[];
  in_stroke: MapStation['in_stroke'];
  out_stroke: MapStation['out_stroke'];
};

export type LaidTick = {
  id: string;
  label: string;
  color: MapColorToken;
  lineId: string;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  dash: boolean;
  connects_to: string | null;
  labelBox: LabelBox;
  labelSide: PortSide;
  ports: ConnectorPort[];
};

export type MapCanvasLayout = {
  width: number;
  height: number;
  year: number;
  yearTop: number;
  yearBottom: number;
  terms: TermBand[];
  lines: LaidLine[];
  stations: LaidStation[];
  ticks: LaidTick[];
  ports: ConnectorPort[];
  connectors: LaidConnector[];
  boxes: LabelBox[];
};

const KNOWN_TERMS: Record<number, { t1: string; t2: string; t3: string; t4: string; e: string }> = {
  2026: {
    t1: '2026-01-27',
    t2: '2026-04-27',
    t3: '2026-07-20',
    t4: '2026-10-12',
    e: '2026-12-31'
  }
};

export function schoolTerms(year: number): { t1: string; t2: string; t3: string; t4: string; e: string } {
  return (
    KNOWN_TERMS[year] ?? {
      t1: `${year}-01-27`,
      t2: `${year}-04-27`,
      t3: `${year}-07-20`,
      t4: `${year}-10-12`,
      e: `${year}-12-31`
    }
  );
}

export function dateToY(iso: string, year: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): number {
  const parsed = parseDue(iso) ?? new Date(year, 0, 1);
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  const t = Math.min(1, Math.max(0, (parsed.getTime() - start) / (end - start)));
  return yearTop + t * (yearBottom - yearTop);
}

export function yToDate(y: number, year: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): string {
  const t = Math.min(1, Math.max(0, (y - yearTop) / (yearBottom - yearTop)));
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year, 11, 31).getTime();
  return toDateKey(new Date(start + t * (end - start)));
}

function remapLegacyY(y: number, yearTop = MAP_YEAR_TOP, yearBottom = MAP_YEAR_BOTTOM): number {
  const oldTop = 40;
  const oldBottom = 1040;
  const t = Math.min(1, Math.max(0, (y - oldTop) / (oldBottom - oldTop)));
  return yearTop + t * (yearBottom - yearTop);
}

export function spanWeeks(startsOn: string | null, endsOn: string | null, year: number): number {
  const start = parseDue(startsOn) ?? new Date(year, 0, 1);
  const end = parseDue(endsOn) ?? start;
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return Math.max(1, Math.round(days / 7));
}

export function estimateVerticalLabel(text: string, fontSize = 12): { w: number; h: number } {
  return { w: fontSize + 6, h: Math.max(fontSize, text.length * fontSize * 0.72) };
}

export function estimateHorizontalLabel(text: string, fontSize = 12): { w: number; h: number } {
  return { w: Math.max(fontSize, text.length * fontSize * 0.64), h: fontSize + 8 };
}

export function boxesOverlap(a: LabelBox, b: LabelBox, pad = MAP_LABEL_PAD): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export function placeBox(
  preferred: LabelBox,
  occupied: LabelBox[],
  canvas: { width: number; height: number }
): LabelBox {
  const ys = [0, 18, -18, 36, -36, 54, -54, 72, -72, 96, -96, 120, -120, 150, -150];
  const xs = [0, 24, -24, 48, -48, 72, -72, 104, -104, 140, -140];
  for (const dy of ys) {
    for (const dx of xs) {
      const box: LabelBox = {
        ...preferred,
        x: Math.min(Math.max(canvas.width, preferred.x + preferred.w + 160) - preferred.w - 8, Math.max(8, preferred.x + dx)),
        y: Math.min(canvas.height - preferred.h - 8, Math.max(8, preferred.y + dy))
      };
      if (!occupied.some((other) => other.id !== box.id && boxesOverlap(box, other))) {
        return box;
      }
    }
  }
  const right = occupied.reduce((max, box) => Math.max(max, box.x + box.w), MAP_FIRST_LINE_X);
  return {
    ...preferred,
    x: right + MAP_LABEL_PAD,
    y: Math.min(canvas.height - preferred.h - 8, Math.max(8, preferred.y))
  };
}

export function nextLineX(lines: MapLine[]): number {
  if (!lines.length) return MAP_FIRST_LINE_X;
  return Math.max(...lines.map((line) => lineX(line))) + MAP_LINE_GAP;
}

export function yearLinePoints(x: number): Array<{ x: number; y: number }> {
  return [
    { x, y: MAP_YEAR_TOP },
    { x, y: MAP_YEAR_BOTTOM }
  ];
}

export function applyDateSpanToStation(station: MapStation, year: number): MapStation {
  if (!station.starts_on) return station;
  const y = dateToY(station.starts_on, year);
  const endY = dateToY(station.ends_on || `${year}-12-31`, year);
  const minH = estimateVerticalLabel(station.label).h + 28;
  return {
    ...station,
    y,
    height: Math.max(minH, endY - y)
  };
}

export function applyDateToTickAttach(tick: MapTick, year: number): MapTick {
  if (!tick.starts_on || tick.attach.kind !== 'line') return tick;
  return {
    ...tick,
    attach: { ...tick.attach, y: dateToY(tick.starts_on, year) }
  };
}

export function stationPorts(station: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  weeks: number;
}): ConnectorPort[] {
  const weeks = Math.max(1, station.weeks);
  const inset = Math.min(18, station.h / 6);
  const top = station.y + inset;
  const bottom = station.y + station.h - inset;
  const span = Math.max(1, bottom - top);
  const ports: ConnectorPort[] = [];
  for (const side of ['left', 'right'] as const) {
    for (let index = 0; index < weeks; index += 1) {
      const t = weeks === 1 ? 0.5 : index / (weeks - 1);
      ports.push({
        id: `${station.id}:${side}:${index}`,
        ownerId: station.id,
        owner: 'station',
        side,
        index,
        x: side === 'left' ? station.x - station.w / 2 : station.x + station.w / 2,
        y: top + t * span
      });
    }
  }
  return ports;
}

export function eventPorts(tick: { id: string; cx: number; cy: number; r?: number }): ConnectorPort[] {
  const r = tick.r ?? MAP_TICK_R;
  return [
    { id: `${tick.id}:top`, ownerId: tick.id, owner: 'event', side: 'top', index: 0, x: tick.cx, y: tick.cy - r },
    { id: `${tick.id}:bottom`, ownerId: tick.id, owner: 'event', side: 'bottom', index: 0, x: tick.cx, y: tick.cy + r },
    { id: `${tick.id}:left`, ownerId: tick.id, owner: 'event', side: 'left', index: 0, x: tick.cx - r, y: tick.cy },
    { id: `${tick.id}:right`, ownerId: tick.id, owner: 'event', side: 'right', index: 0, x: tick.cx + r, y: tick.cy }
  ];
}

export function eventMarkBox(tick: { id: string; cx: number; cy: number }): LabelBox {
  return {
    id: `mark-${tick.id}`,
    x: tick.cx - MAP_TICK_R,
    y: tick.cy - MAP_TICK_R,
    w: MAP_TICK_R * 2,
    h: MAP_TICK_R * 2
  };
}

export function lineStrokeBox(line: { id: string; x: number; y0: number; y1: number }): LabelBox {
  const half = MAP_LINE_STROKE / 2 + 4;
  return {
    id: `line-${line.id}`,
    x: line.x - half,
    y: line.y0,
    w: half * 2,
    h: line.y1 - line.y0
  };
}

export function nearestPort(ports: ConnectorPort[], side: PortSide, y: number): ConnectorPort | null {
  const onSide = ports.filter((port) => port.side === side);
  if (!onSide.length) return null;
  return onSide.reduce((best, port) => (Math.abs(port.y - y) < Math.abs(best.y - y) ? port : best));
}

export function orthogonalPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  if (Math.abs(from.y - to.y) < 1) return `M ${from.x} ${from.y} H ${to.x}`;
  if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
  const mid = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} H ${mid} V ${to.y} H ${to.x}`;
}

function stripHits(
  y: number,
  x0: number,
  x1: number,
  obstacles: LabelBox[],
  pad: number
): boolean {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  return obstacles.some(
    (box) =>
      y >= box.y - pad &&
      y <= box.y + box.h + pad &&
      !(box.x + box.w + pad <= left || right + pad <= box.x)
  );
}

export function routedOrthogonalPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: LabelBox[],
  pad = 8
): string {
  if (Math.abs(from.y - to.y) < 1 && !stripHits(from.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} H ${to.x}`;
  }
  if (Math.abs(from.x - to.x) < 1) return `M ${from.x} ${from.y} V ${to.y}`;
  if (!stripHits(from.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} H ${to.x} V ${to.y}`;
  }
  if (!stripHits(to.y, from.x, to.x, obstacles, pad)) {
    return `M ${from.x} ${from.y} V ${to.y} H ${to.x}`;
  }
  for (let step = 1; step < 48; step += 1) {
    for (const y of [from.y - step * 12, from.y + step * 12, to.y - step * 12, to.y + step * 12]) {
      if (y < MAP_YEAR_TOP || y > MAP_YEAR_BOTTOM) continue;
      if (!stripHits(y, from.x, to.x, obstacles, pad)) {
        return `M ${from.x} ${from.y} V ${y} H ${to.x} V ${to.y}`;
      }
    }
  }
  return orthogonalPath(from, to);
}

function oppositeSide(side: PortSide): PortSide {
  if (side === 'left') return 'right';
  if (side === 'right') return 'left';
  if (side === 'top') return 'bottom';
  return 'top';
}

function labelForSide(
  tick: { id: string; cx: number; cy: number; label: string },
  side: PortSide
): LabelBox {
  const size = estimateHorizontalLabel(tick.label, 12);
  const w = size.w + MAP_CHIP_PAD * 2;
  const h = size.h + MAP_CHIP_PAD * 2;
  const gap = 22;
  if (side === 'right') {
    return { id: `tk-${tick.id}`, x: tick.cx + MAP_TICK_R + gap, y: tick.cy - h / 2, w, h };
  }
  if (side === 'left') {
    return { id: `tk-${tick.id}`, x: tick.cx - MAP_TICK_R - gap - w, y: tick.cy - h / 2, w, h };
  }
  if (side === 'top') {
    return { id: `tk-${tick.id}`, x: tick.cx - w / 2, y: tick.cy - MAP_TICK_R - gap - h, w, h };
  }
  return { id: `tk-${tick.id}`, x: tick.cx - w / 2, y: tick.cy + MAP_TICK_R + gap, w, h };
}

function shiftX(
  line: LaidLine,
  stations: LaidStation[],
  ticks: LaidTick[],
  dx: number
): void {
  if (!dx) return;
  line.x += dx;
  line.disc.cx += dx;
  for (const station of stations) {
    if (station.line_id !== line.id) continue;
    station.lineX += dx;
    station.x += dx;
    for (const port of station.ports) port.x += dx;
  }
  for (const tick of ticks) {
    if (tick.lineId !== line.id) continue;
    tick.x0 += dx;
    tick.cx += dx;
    tick.labelBox.x += dx;
    for (const port of tick.ports) port.x += dx;
  }
}

function exclusiveBoxes(
  terms: TermBand[],
  lines: LaidLine[],
  stations: LaidStation[],
  ticks: LaidTick[]
): LabelBox[] {
  const boxes: LabelBox[] = [];
  for (const term of terms) {
    boxes.push({ id: `term-${term.id}`, x: 18, y: term.y - 16, w: 36, h: 32 });
  }
  for (const line of lines) {
    boxes.push({
      id: `disc-${line.id}`,
      x: line.disc.cx - line.disc.r,
      y: line.disc.cy - line.disc.r,
      w: line.disc.r * 2,
      h: line.disc.r * 2
    });
  }
  for (const station of stations) {
    boxes.push({
      id: `st-${station.id}`,
      x: station.x - station.w / 2,
      y: station.y,
      w: station.w,
      h: station.h
    });
  }
  for (const tick of ticks) {
    boxes.push(eventMarkBox(tick), tick.labelBox);
  }
  return boxes;
}

function lineContentBox(
  line: LaidLine,
  stations: LaidStation[],
  ticks: LaidTick[]
): LabelBox {
  const parts: LabelBox[] = [
    {
      id: `disc-${line.id}`,
      x: line.disc.cx - line.disc.r,
      y: line.disc.cy - line.disc.r,
      w: line.disc.r * 2 + 8,
      h: line.disc.r * 2 + 24
    }
  ];
  for (const station of stations.filter((item) => item.line_id === line.id)) {
    parts.push({
      id: station.id,
      x: station.x - station.w / 2,
      y: station.y,
      w: station.w,
      h: station.h
    });
  }
  for (const tick of ticks.filter((item) => item.lineId === line.id)) {
    parts.push(tick.labelBox, eventMarkBox(tick));
  }
  const x0 = Math.min(...parts.map((p) => p.x));
  const y0 = Math.min(...parts.map((p) => p.y));
  const x1 = Math.max(...parts.map((p) => p.x + p.w));
  const y1 = Math.max(...parts.map((p) => p.y + p.h));
  return { id: `group-${line.id}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function packLines(lines: LaidLine[], stations: LaidStation[], ticks: LaidTick[]): void {
  const ordered = [...lines].sort((a, b) => a.x - b.x);
  let cursor = MAP_FIRST_LINE_X;
  for (const line of ordered) {
    const box = lineContentBox(line, stations, ticks);
    const need = cursor - box.x;
    if (need > 0) shiftX(line, stations, ticks, need);
    const after = lineContentBox(line, stations, ticks);
    cursor = after.x + after.w + MAP_PORT_GAP;
  }
}

function preferredLabelSides(outward: PortSide): PortSide[] {
  const opposite = outward === 'left' ? 'right' : 'left';
  return [outward, 'top', 'bottom', opposite];
}

function resolveTickLabel(
  tick: LaidTick,
  occupied: LabelBox[],
  canvas: { width: number; height: number },
  obstacles: LabelBox[]
): void {
  const outward: PortSide = tick.cx >= tick.x0 ? 'right' : 'left';
  const sides = preferredLabelSides(outward);
  for (const side of sides) {
    const box = labelForSide(tick, side);
    const others = [...occupied, ...obstacles].filter((item) => item.id !== box.id && item.id !== `mark-${tick.id}`);
    if (!others.some((item) => boxesOverlap(box, item))) {
      tick.labelBox = box;
      tick.labelSide = side;
      return;
    }
  }
  tick.labelBox = placeBox(tick.labelBox, [...occupied, ...obstacles], canvas);
}

function matchLine(connectsTo: string | null, lines: LaidLine[]): LaidLine | null {
  if (!connectsTo) return null;
  const text = connectsTo.toLowerCase();
  return (
    lines.find((line) => text.includes(line.name.toLowerCase()) || text.includes(` ${line.letter.toLowerCase()}`)) ??
    null
  );
}

function assignStationLanes(stations: LaidStation[]): LaidStation[] {
  const byLine = new Map<string, LaidStation[]>();
  for (const station of stations) {
    const list = byLine.get(station.line_id) ?? [];
    list.push(station);
    byLine.set(station.line_id, list);
  }
  const out: LaidStation[] = [];
  for (const group of byLine.values()) {
    const sorted = [...group].sort((a, b) => a.y - b.y);
    const lanes: LaidStation[] = [];
    for (const station of sorted) {
      let lane = 0;
      while (
        lanes.some(
          (other) =>
            other.lane === lane &&
            boxesOverlap(
              { id: station.id, x: 0, y: station.y, w: 10, h: station.h },
              { id: other.id, x: 0, y: other.y, w: 10, h: other.h },
              12
            )
        )
      ) {
        lane += 1;
      }
      const shifted: LaidStation = {
        ...station,
        lane,
        x: station.lineX + lane * 52,
        ports: []
      };
      shifted.ports = stationPorts(shifted);
      lanes.push(shifted);
      out.push(shifted);
    }
  }
  return out;
}

export function layoutMap(map: TransitMap): MapCanvasLayout {
  const year = map.year ?? new Date().getFullYear();
  const yearTop = MAP_YEAR_TOP;
  const yearBottom = MAP_YEAR_BOTTOM;
  const termsRaw = schoolTerms(year);
  const terms: TermBand[] = [
    { id: 'T1', label: 'T1', date: termsRaw.t1, y: dateToY(termsRaw.t1, year) },
    { id: 'T2', label: 'T2', date: termsRaw.t2, y: dateToY(termsRaw.t2, year) },
    { id: 'T3', label: 'T3', date: termsRaw.t3, y: dateToY(termsRaw.t3, year) },
    { id: 'T4', label: 'T4', date: termsRaw.t4, y: dateToY(termsRaw.t4, year) },
    { id: 'E', label: 'E', date: termsRaw.e, y: dateToY(termsRaw.e, year) }
  ];

  const lines: LaidLine[] = map.lines.map((line, index) => {
    const x = MAP_FIRST_LINE_X + index * MAP_LINE_GAP;
    return {
      id: line.id,
      name: line.name,
      letter: line.letter,
      color: line.color,
      x,
      y0: yearTop,
      y1: yearBottom,
      disc: { cx: x, cy: yearTop - 48, r: MAP_DISC_R }
    };
  });

  const drafted: LaidStation[] = map.stations.map((raw) => {
    const dated = applyDateSpanToStation(raw, year);
    const line = lines.find((item) => item.id === dated.line_id);
    const x = line?.x ?? MAP_FIRST_LINE_X;
    const y = dated.starts_on ? dated.y : remapLegacyY(dated.y);
    const minH = estimateVerticalLabel(dated.label).h + 28;
    const h = dated.starts_on
      ? Math.max(minH, dated.height)
      : Math.max(minH, remapLegacyY(dated.y + dated.height) - y);
    const weeks = spanWeeks(dated.starts_on, dated.ends_on, year);
    const station: LaidStation = {
      id: dated.id,
      line_id: dated.line_id,
      label: dated.label,
      color: line?.color ?? 'wave',
      lineX: x,
      x,
      y,
      w: MAP_STATION_W,
      h,
      lane: 0,
      weeks,
      ports: [],
      in_stroke: dated.in_stroke,
      out_stroke: dated.out_stroke
    };
    station.ports = stationPorts(station);
    return station;
  });
  const stations = assignStationLanes(drafted);

  const ticks: LaidTick[] = [];
  for (const raw of map.ticks) {
    const tick = applyDateToTickAttach(raw, year);
    const attach = tick.attach;
    let lineId = '';
    let x0 = MAP_FIRST_LINE_X;
    let y0 = yearTop;
    let color: MapColorToken = 'wave';
    let side: PortSide = 'right';
    if (attach.kind === 'line') {
      const line = lines.find((item) => item.id === attach.line_id);
      if (!line) continue;
      lineId = line.id;
      x0 = line.x;
      y0 = tick.starts_on ? dateToY(tick.starts_on, year) : remapLegacyY(attach.y);
      color = line.color;
    } else {
      const station = stations.find((item) => item.id === attach.station_id);
      const source = map.stations.find((item) => item.id === attach.station_id);
      const line = lines.find((item) => item.id === source?.line_id);
      if (!station || !line) continue;
      lineId = line.id;
      side = attach.side;
      const port = nearestPort(station.ports, attach.side, station.y + station.h * attach.offset);
      x0 = port?.x ?? station.x + (attach.side === 'left' ? -station.w / 2 : station.w / 2);
      y0 = port?.y ?? station.y + station.h * attach.offset;
      color = line.color;
    }
    const dir = side === 'left' ? -1 : 1;
    const laid: LaidTick = {
      id: tick.id,
      label: tick.label,
      color,
      lineId,
      x0,
      y0,
      cx: x0 + dir * MAP_EVENT_STEM,
      cy: y0,
      dash: tick.stroke === 'dotted',
      connects_to: tick.connects_to,
      labelBox: { id: `tk-${tick.id}`, x: 0, y: 0, w: 10, h: 10 },
      labelSide: side === 'left' ? 'left' : 'right',
      ports: []
    };
    laid.labelBox = labelForSide(laid, laid.labelSide);
    laid.ports = eventPorts(laid);
    ticks.push(laid);
  }

  packLines(lines, stations, ticks);

  let width = Math.max(1200, ...lines.map((line) => line.x + 320));
  const height = yearBottom + 80;
  const canvas = { width, height };

  for (let pass = 0; pass < 6; pass += 1) {
    const occupied = exclusiveBoxes(terms, lines, stations, ticks);
    const obstacles = lines.map((line) => lineStrokeBox(line));
    for (const tick of ticks) {
      resolveTickLabel(tick, occupied, canvas, obstacles);
      const idx = occupied.findIndex((box) => box.id === tick.labelBox.id);
      if (idx >= 0) occupied[idx] = tick.labelBox;
      else occupied.push(tick.labelBox);
    }
    packLines(lines, stations, ticks);
    width = Math.max(
      width,
      ...lines.map((line) => line.x + 320),
      ...ticks.map((tick) => tick.labelBox.x + tick.labelBox.w + 48)
    );
    canvas.width = width;
  }

  for (const station of stations) station.ports = stationPorts(station);
  for (const tick of ticks) tick.ports = eventPorts(tick);

  const connectors: LaidConnector[] = [];
  const pathObstacles = exclusiveBoxes(terms, lines, stations, ticks);
  for (const tick of ticks) {
    const raw = map.ticks.find((item) => item.id === tick.id);
    const attach = raw?.attach;
    if (!attach) continue;
    let from: ConnectorPort | null = null;
    if (attach.kind === 'station') {
      const station = stations.find((item) => item.id === attach.station_id);
      from = station ? nearestPort(station.ports, attach.side, tick.y0) : null;
    } else {
      const line = lines.find((item) => item.id === attach.line_id);
      if (line) {
        from = {
          id: `${line.id}:week:${Math.round(tick.y0)}`,
          ownerId: line.id,
          owner: 'line',
          side: tick.cx >= line.x ? 'right' : 'left',
          index: 0,
          x: line.x,
          y: tick.y0
        };
      }
    }
    const toSide = from?.side ? oppositeSide(from.side === 'top' || from.side === 'bottom' ? 'right' : from.side) : 'left';
    const to = tick.ports.find((port) => port.side === toSide) ?? tick.ports[2] ?? null;
    const ownIds = new Set([tick.labelBox.id, `mark-${tick.id}`, attach.kind === 'station' ? `st-${attach.station_id}` : '']);
    const blocked = pathObstacles.filter((box) => !ownIds.has(box.id));
    if (from && to) {
      connectors.push({
        id: `link-${tick.id}`,
        from,
        to,
        path: routedOrthogonalPath(from, to, blocked),
        color: tick.color,
        dash: tick.dash
      });
    }
    const other = matchLine(tick.connects_to, lines);
    if (other) {
      const out = nearestPort(tick.ports, other.x >= tick.cx ? 'right' : 'left', tick.cy) ?? tick.ports[3]!;
      const dest: ConnectorPort = {
        id: `${other.id}:in:${tick.id}`,
        ownerId: other.id,
        owner: 'line',
        side: other.x >= tick.cx ? 'left' : 'right',
        index: 0,
        x: other.x,
        y: tick.cy
      };
      connectors.push({
        id: `cross-${tick.id}`,
        from: out,
        to: dest,
        path: routedOrthogonalPath(out, dest, blocked.filter((box) => box.id !== `disc-${other.id}`)),
        color: other.color,
        dash: true
      });
    }
  }

  const ports = [
    ...stations.flatMap((station) => station.ports),
    ...ticks.flatMap((tick) => tick.ports)
  ];
  const boxes = exclusiveBoxes(terms, lines, stations, ticks);
  return {
    width,
    height,
    year,
    yearTop,
    yearBottom,
    terms,
    lines,
    stations,
    ticks,
    ports,
    connectors,
    boxes
  };
}

export function labelHitsForeignLine(layout: MapCanvasLayout): boolean {
  return layout.ticks.some((tick) =>
    layout.lines.some(
      (line) => line.id !== tick.lineId && boxesOverlap(tick.labelBox, lineStrokeBox(line))
    )
  );
}

export const LINE_COLORS: MapColorToken[] = [
  'navy',
  'high-sea-ink',
  'success',
  'lilac',
  'wave',
  'marine',
  'depth'
];

export function nextLineLetter(lines: MapLine[]): string {
  const used = new Set(lines.map((line) => line.letter.toUpperCase()));
  for (const letter of ['J', 'I', 'E', 'R', 'A', 'B', 'C', 'D', 'F', 'G', 'H', 'K', 'L', 'M', 'N']) {
    if (!used.has(letter)) return letter;
  }
  return 'N';
}
