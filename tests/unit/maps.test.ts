import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { TransitMapSchema } from '@/schemas/map';
import {
  attachTick,
  capsuleOccupies,
  crossingKind,
  exportMapHtml,
  isOrthogonalPath,
  pickCurrentYearMap,
  segmentCrossings,
  stationLineCuts
} from '@/domain/maps';
import { mindWorks2026Map } from '@/domain/maps-seed';
import {
  applyDateSpanToStation,
  boxesOverlap,
  dateToY,
  eventPorts,
  labelHitsForeignLine,
  layoutMap,
  lineStrokeBox,
  placeBox,
  schoolTerms,
  spanWeeks,
  stationPorts
} from '@/domain/maps-layout';
import { mapsOrSeed } from '@/views/maps';

describe('map schema', () => {
  it('accepts a valid map and rejects a diagonal line', () => {
    const map = mindWorks2026Map();
    expect(TransitMapSchema.parse(map).id).toBe('map_mindworks_2026');
    expect(() =>
      TransitMapSchema.parse({
        ...map,
        lines: [{ ...map.lines[0]!, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] }]
      })
    ).toThrow();
  });
});

describe('orthogonal paths', () => {
  it('allows horizontal and vertical steps only', () => {
    expect(isOrthogonalPath([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 20, y: 40 }])).toBe(true);
    expect(isOrthogonalPath([{ x: 0, y: 0 }, { x: 8, y: 8 }])).toBe(false);
  });
});

describe('crossings', () => {
  it('tunnels when lines cross without a station', () => {
    const crossings = segmentCrossings(
      [
        { id: 'a', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: 'b', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }
      ],
      []
    );
    expect(crossings).toHaveLength(1);
    expect(crossingKind(crossings[0]!, [])).toBe('tunnel');
  });

  it('is an interchange when a station occupies the crossing', () => {
    const stations = [{ id: 's1', line_id: 'b', y: 50, height: 48 }];
    const crossings = segmentCrossings(
      [
        { id: 'a', points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { id: 'b', points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] }
      ],
      stations
    );
    expect(crossingKind(crossings[0]!, stations)).toBe('interchange');
    expect(capsuleOccupies(stations[0]!, { x: 50, y: 50 })).toBe(true);
  });
});

describe('ticks', () => {
  it('attaches to a line or a station side', () => {
    const onLine = attachTick({ kind: 'line', line_id: 'j', y: 120 });
    const onStation = attachTick({ kind: 'station', station_id: 'st_ydp', side: 'right', offset: 0.4 });
    expect(onLine.kind).toBe('line');
    expect(onStation.kind).toBe('station');
    if (onStation.kind !== 'station') throw new Error('expected station attach');
    expect(onStation.side).toBe('right');
  });
});

describe('station geometry', () => {
  it('cuts the line at the capsule — no stroke through the fill', () => {
    const cuts = stationLineCuts(
      { points: [{ x: 80, y: 0 }, { x: 80, y: 400 }] },
      [{ y: 100, height: 80 }]
    );
    expect(cuts.some((c) => c.y0 === 100 && c.y1 === 180)).toBe(false);
    expect(cuts.some((c) => c.y1 === 100)).toBe(true);
    expect(cuts.some((c) => c.y0 === 180)).toBe(true);
  });
});

describe('MindWorks 2026 seed', () => {
  it('has four lines and poster programs', () => {
    const map = mindWorks2026Map();
    expect(map.lines.map((l) => l.letter).sort()).toEqual(['E', 'I', 'J', 'R']);
    const labels = map.stations.map((s) => s.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'Young Diplomats Program',
        'Diplomacy and Advocacy',
        'Young Creators Lab',
        'StudioGAT',
        'Foundations Psychology'
      ])
    );
    expect(map.ticks.some((t) => t.attach.kind === 'line')).toBe(true);
    expect(map.ticks.some((t) => t.attach.kind === 'station')).toBe(true);
    expect(map.lines.find((l) => l.letter === 'J')?.color).toBe('navy');
    expect(map.stations.every((s) => s.starts_on && s.ends_on)).toBe(true);
  });
});

describe('year layout', () => {
  it('maps dates onto the calendar year and draws T1–T4 plus E', () => {
    const year = 2026;
    const terms = schoolTerms(year);
    const t1 = dateToY(terms.t1, year);
    const e = dateToY(terms.e, year);
    expect(t1).toBeLessThan(dateToY(terms.t2, year));
    expect(dateToY(terms.t4, year)).toBeLessThan(e);
    const later = applyDateSpanToStation(
      {
        id: 'st_x',
        line_id: 'line_justice',
        label: 'Later program',
        y: 0,
        height: 10,
        in_stroke: 'solid',
        out_stroke: 'solid',
        starts_on: '2026-10-12',
        ends_on: '2026-12-17',
        link: null
      },
      year
    );
    expect(later.y).toBeGreaterThan(t1);
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.terms.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4', 'E']);
    expect(layout.lines.map((l) => l.letter).sort()).toEqual(['E', 'I', 'J', 'R']);
  });

  it('gives a term-length program weekly ports on both sides', () => {
    expect(spanWeeks('2026-01-27', '2026-04-10', 2026)).toBe(10);
    const ports = stationPorts({
      id: 'st_term',
      x: 200,
      y: 100,
      w: 40,
      h: 200,
      weeks: 10
    });
    expect(ports.filter((p) => p.side === 'left')).toHaveLength(10);
    expect(ports.filter((p) => p.side === 'right')).toHaveLength(10);
  });

  it('gives an event four cardinal ports', () => {
    const ports = eventPorts({ id: 'tk', cx: 80, cy: 80 });
    expect(ports.map((p) => p.side).sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('connects events through ports and keeps line groups packed', () => {
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.connectors.length).toBeGreaterThan(0);
    const mock = layout.stations.find((s) => s.id === 'st_mock');
    expect(mock?.weeks).toBeGreaterThanOrEqual(10);
    expect(mock?.ports.filter((p) => p.side === 'left')).toHaveLength(mock!.weeks);
    const xs = layout.lines.map((line) => line.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(80);
    }
  });

  it('never leaves two label boxes overlapping', () => {
    const layout = layoutMap(mindWorks2026Map());
    const boxes = layout.boxes;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(boxesOverlap(boxes[i]!, boxes[j]!)).toBe(false);
      }
    }
    const placed = placeBox(
      { id: 'probe', x: boxes[0]!.x, y: boxes[0]!.y, w: 20, h: 20 },
      boxes,
      { width: layout.width, height: layout.height }
    );
    expect(boxes.some((box) => boxesOverlap(box, placed))).toBe(false);
  });

  it('keeps event chips horizontal and off every other line', () => {
    const layout = layoutMap(mindWorks2026Map());
    expect(layout.ticks.length).toBeGreaterThan(0);
    expect(layout.ticks.every((tick) => tick.labelBox.w > tick.labelBox.h)).toBe(true);
    expect(labelHitsForeignLine(layout)).toBe(false);
    for (const tick of layout.ticks) {
      for (const line of layout.lines) {
        if (line.id === tick.lineId) continue;
        expect(boxesOverlap(tick.labelBox, lineStrokeBox(line))).toBe(false);
      }
    }
  });

  it('slides a later line right when the first line grows a wide event', () => {
    const base = mindWorks2026Map();
    const packed = layoutMap(base);
    const grown = layoutMap({
      ...base,
      ticks: [
        ...base.ticks,
        {
          id: 'tk_wide',
          label: 'A very long festival of ideas and public speaking',
          attach: { kind: 'line', line_id: 'line_justice', y: 220 },
          stroke: 'solid',
          connects_to: null,
          starts_on: '2026-03-12',
          ends_on: null,
          link: null
        }
      ]
    });
    const firstI = packed.lines.find((line) => line.id === 'line_innovation')!.x;
    const grownI = grown.lines.find((line) => line.id === 'line_innovation')!.x;
    expect(grownI).toBeGreaterThan(firstI);
    expect(labelHitsForeignLine(grown)).toBe(false);
  });
});

describe('library default', () => {
  it('seeds MindWorks when the API returns nothing', () => {
    expect(mapsOrSeed([]).map((m) => m.id)).toEqual(['map_mindworks_2026']);
    expect(mapsOrSeed(undefined).map((m) => m.id)).toEqual(['map_mindworks_2026']);
  });

  it('picks the current-year map when present', () => {
    const maps = [
      { ...mindWorks2026Map(), id: 'map_old', year: 2025, title: 'Old' },
      mindWorks2026Map()
    ];
    expect(pickCurrentYearMap(maps, 2026)?.id).toBe('map_mindworks_2026');
  });
});

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

describe('maps store', () => {
  it('seeds MindWorks 2026 even when the fixture has no maps', async () => {
    const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const maps = await store.listMaps();
    expect(maps.some((m) => m.id === 'map_mindworks_2026')).toBe(true);
    const created = await store.createMap({ title: 'Scratch' });
    expect(created.lines).toEqual([]);
    const updated = await store.updateMap(created.id, { title: 'Scratch v2' });
    expect(updated.title).toBe('Scratch v2');
  });
});

describe('export', () => {
  it('writes viewer-only HTML with hub tokens and no edit chrome', () => {
    const html = exportMapHtml(mindWorks2026Map());
    expect(html).toContain('data-hub="tasks"');
    expect(html).toContain('--wave');
    expect(html).not.toContain('+ Program');
    expect(html).not.toContain('hub-rail');
    expect(html).toContain('Young Diplomats Program');
  });
});
