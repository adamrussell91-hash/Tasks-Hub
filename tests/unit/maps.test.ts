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
