import type { MapColorToken, MapLine, MapStation, MapTick, Point, TransitMap } from '@/schemas/map';
import { parseDue, toDateKey } from '@/domain/queries';

export function lineX(line: { points: Point[] }): number {
  return line.points[0]?.x ?? 0;
}

export const MAP_YEAR_TOP = 168;
export const MAP_YEAR_BOTTOM = 1380;
export const MAP_LEFT = 88;
export const MAP_LINE_GAP = 240;
export const MAP_FIRST_LINE_X = 200;
export const MAP_DISC_R = 20;
export const MAP_STATION_W = 40;
export const MAP_TICK_R = 8;
export const MAP_LABEL_PAD = 8;

export type TermId = 'T1' | 'T2' | 'T3' | 'T4' | 'E';

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
  in_stroke: MapStation['in_stroke'];
  out_stroke: MapStation['out_stroke'];
};

export type LaidTick = {
  id: string;
  label: string;
  color: MapColorToken;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  dash: boolean;
  connects_to: string | null;
  labelBox: LabelBox;
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

export function estimateVerticalLabel(text: string, fontSize = 12): { w: number; h: number } {
  return { w: fontSize + 4, h: Math.max(fontSize, text.length * fontSize * 0.68) };
}

export function estimateHorizontalLabel(text: string, fontSize = 12): { w: number; h: number } {
  return { w: Math.max(fontSize, text.length * fontSize * 0.62), h: fontSize + 6 };
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
  const ys = [0, 16, -16, 32, -32, 48, -48, 64, -64, 80, -80, 96, -96];
  const xs = [0, 20, -20, 40, -40, 60, -60, 80, -80];
  for (const dy of ys) {
    for (const dx of xs) {
      const box: LabelBox = {
        ...preferred,
        x: Math.min(canvas.width - preferred.w - 8, Math.max(8, preferred.x + dx)),
        y: Math.min(canvas.height - preferred.h - 8, Math.max(8, preferred.y + dy))
      };
      if (!occupied.some((other) => other.id !== box.id && boxesOverlap(box, other))) {
        return box;
      }
    }
  }
  return preferred;
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

export function applyDateSpanToStation(
  station: MapStation,
  year: number
): MapStation {
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

  const lines: LaidLine[] = map.lines.map((line) => {
    const x = lineX(line);
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
    const line = map.lines.find((item) => item.id === dated.line_id);
    const x = line ? lineX(line) : MAP_FIRST_LINE_X;
    const y = dated.starts_on ? dated.y : remapLegacyY(dated.y);
    const minH = estimateVerticalLabel(dated.label).h + 28;
    const h = dated.starts_on
      ? Math.max(minH, dated.height)
      : Math.max(minH, remapLegacyY(dated.y + dated.height) - y);
    return {
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
      in_stroke: dated.in_stroke,
      out_stroke: dated.out_stroke
    };
  });
  const stations = assignStationLanes(drafted);

  const width = Math.max(1100, ...lines.map((line) => line.x + 220), MAP_FIRST_LINE_X + 220);
  const height = yearBottom + 80;
  const occupied: LabelBox[] = [];

  for (const term of terms) {
    occupied.push({ id: `term-${term.id}`, x: 10, y: term.y - 16, w: 36, h: 32 });
  }
  for (const line of lines) {
    occupied.push({
      id: `disc-${line.id}`,
      x: line.disc.cx - line.disc.r,
      y: line.disc.cy - line.disc.r,
      w: line.disc.r * 2,
      h: line.disc.r * 2
    });
    const name = estimateHorizontalLabel(line.name, 13);
    occupied.push({
      id: `linename-${line.id}`,
      x: line.disc.cx + line.disc.r + 8,
      y: line.disc.cy - name.h / 2,
      w: name.w,
      h: name.h
    });
  }
  for (const station of stations) {
    occupied.push({
      id: `st-${station.id}`,
      x: station.x - station.w / 2,
      y: station.y,
      w: station.w,
      h: station.h
    });
  }

  const ticks: LaidTick[] = [];
  for (const raw of map.ticks) {
    const tick = applyDateToTickAttach(raw, year);
    const attach = tick.attach;
    let x0 = MAP_FIRST_LINE_X;
    let y0 = yearTop;
    let color: MapColorToken = 'wave';
    if (attach.kind === 'line') {
      const line = map.lines.find((item) => item.id === attach.line_id);
      if (!line) continue;
      x0 = lineX(line);
      y0 = tick.starts_on ? dateToY(tick.starts_on, year) : remapLegacyY(attach.y);
      color = line.color;
    } else {
      const station = stations.find((item) => item.id === attach.station_id);
      const source = map.stations.find((item) => item.id === attach.station_id);
      const line = map.lines.find((item) => item.id === source?.line_id);
      if (!station || !line) continue;
      x0 = station.x + (attach.side === 'left' ? -station.w / 2 : station.w / 2);
      y0 = station.y + station.h * attach.offset;
      color = line.color;
    }
    const preferRight = attach.kind === 'station' ? attach.side !== 'left' : true;
    const dir = preferRight ? 1 : -1;
    const cx = x0 + dir * 28;
    const cy = y0;
    const size = estimateVerticalLabel(tick.label, 12);
    const preferred: LabelBox = {
      id: `tk-${tick.id}`,
      x: dir > 0 ? cx + MAP_TICK_R + 6 : cx - MAP_TICK_R - 6 - size.w,
      y: cy - size.h / 2,
      w: size.w,
      h: size.h
    };
    const labelBox = placeBox(preferred, occupied, { width, height });
    occupied.push(labelBox);
    ticks.push({
      id: tick.id,
      label: tick.label,
      color,
      x0,
      y0,
      cx,
      cy,
      dash: tick.stroke === 'dotted',
      connects_to: tick.connects_to,
      labelBox
    });
  }

  return { width, height, year, yearTop, yearBottom, terms, lines, stations, ticks, boxes: occupied };
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
      const shifted = {
        ...station,
        lane,
        x: station.lineX + lane * 52
      };
      lanes.push(shifted);
      out.push(shifted);
    }
  }
  return out;
}

export function nextLineLetter(lines: MapLine[]): string {
  const used = new Set(lines.map((line) => line.letter.toUpperCase()));
  for (const letter of ['J', 'I', 'E', 'R', 'A', 'B', 'C', 'D', 'F', 'G', 'H', 'K', 'L', 'M', 'N']) {
    if (!used.has(letter)) return letter;
  }
  return 'N';
}
