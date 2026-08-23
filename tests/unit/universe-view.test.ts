import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSolarModel, worldPositions, type Body, type UniverseEntry } from '@/domain/universe';
import { DOMAIN_VOCABULARY } from '@/domain/universe';
import {
  UNIVERSE_BUILD,
  KIND_DEPTH,
  advanceOrbitClock,
  fillDots,
  glowSpread,
  mountUniverseView,
  presence,
  resolveSearchHits,
  searchResolveStats,
  solarCamera,
  solarScales,
  solarZoomClamp,
  zoomBand
} from '@/views/universe-canvas';

const V0 = DOMAIN_VOCABULARY[0];

function page(id: string, title: string, tags: string[]): UniverseEntry {
  return { id, title, excerpt: '', tags };
}

function tagged(prefix: string, tag: string, n: number, titleAt = (i: number) => `${tag} ${i}`): UniverseEntry[] {
  return Array.from({ length: n }, (_, i) => page(`${prefix}${i}`, titleAt(i), [tag]));
}

function planetBody(partial: Partial<Body> = {}): Body {
  return {
    idx: 0,
    id: 'planet:Test',
    kind: 'planet',
    label: 'Test',
    parent: 0,
    count: 100,
    r: 12,
    sysR: 80,
    a: 420,
    phase: 0,
    period: 300,
    e: 0,
    argP: 0,
    incline: 0,
    color: '#376fb7',
    ink: '#17375e',
    children: [],
    ...partial
  };
}

type Arc = { x: number; y: number; r: number; start: number; end: number };

class FakePath2D {
  count = 0;
  arc(_x: number, _y: number, _r: number, _start: number, _end: number) {
    this.count += 1;
  }
}

function recordingContext() {
  const arcs: Arc[] = [];
  const fullCircleStrokes: Arc[] = [];
  const images: Array<{ w: number; h: number }> = [];
  const fillGroups: number[] = [];
  let pending: Arc | null = null;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {
      pending = null;
    },
    arc(x: number, y: number, r: number, start: number, end: number) {
      pending = { x, y, r, start, end };
      arcs.push(pending);
    },
    fill(path?: FakePath2D) {
      fillGroups.push(path ? path.count : pending ? 1 : 0);
    },
    stroke() {
      if (!pending) return;
      if (Math.abs(pending.end - pending.start) >= Math.PI * 2 - 1e-6) fullCircleStrokes.push(pending);
    },
    fillText() {},
    strokeText() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    drawImage(_img: unknown, _x: number, _y: number, w: number, h: number) {
      images.push({ w, h });
    },
    measureText(text: string) {
      return { width: text.length * 6 };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    }
  };
  return { ctx, arcs, fullCircleStrokes, images, fillGroups };
}

function installCanvas() {
  const recorded = recordingContext();
  HTMLCanvasElement.prototype.getContext = function () {
    return recorded.ctx as unknown as CanvasRenderingContext2D;
  } as unknown as HTMLCanvasElement['getContext'];
  vi.stubGlobal('Path2D', FakePath2D);
  return recorded;
}

function stubFrame() {
  const callbacks: FrameRequestCallback[] = [];
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    id += 1;
    callbacks.push(cb);
    return id;
  });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {}
  }));
  return {
    callbacks,
    cancel,
    pump(now = 16) {
      const cb = callbacks.at(-1);
      cb?.(now);
    }
  };
}

function worldPos(body: Body, model: ReturnType<typeof buildSolarModel>) {
  const pos = worldPositions(model.bodies, 0);
  return { x: pos.x[body.idx]!, y: pos.y[body.idx]! };
}

describe('presence and bands', () => {
  it('exposes a build number so a stale Universe bundle is obvious', () => {
    expect(UNIVERSE_BUILD).toBe(1);
  });

  it('maps band thresholds onto KIND_DEPTH cutoffs', () => {
    expect(KIND_DEPTH.sun).toBe(0);
    expect(KIND_DEPTH.planet).toBe(0);
    expect(KIND_DEPTH.rock).toBe(0);
    expect(KIND_DEPTH.minor).toBe(0);
    expect(KIND_DEPTH.moon).toBe(0);
    expect(KIND_DEPTH.page).toBe(1);
    expect(zoomBand(0)).toBe(0);
    expect(zoomBand(2.39)).toBe(0);
    expect(zoomBand(2.4)).toBe(1);
    expect(zoomBand(8.9)).toBe(1);
    expect(zoomBand(9)).toBe(2);
    expect(zoomBand(44)).toBe(2);
    expect(zoomBand(45)).toBe(3);
  });

  it('is monotonic in z and never returns below the screen-space floor', () => {
    const planet = planetBody();
    const k = 0.04;
    const samples = Array.from({ length: 20 }, (_, i) => presence(planet, i, k, 100));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]! + 1e-9);
    }
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(3 / k);
    expect(presence(planetBody({ kind: 'page', r: 0.85, sysR: 0.85 }), 1, k, 100)).toBeGreaterThanOrEqual(2.4 / k);
    expect(presence(planetBody({ kind: 'moon', r: 2, sysR: 8, count: 12 }), 1, k, 100)).toBeGreaterThanOrEqual(
      4.2 / k
    );
    const giant = planetBody({ giant: true, count: 200 });
    const ordinary = planetBody({ count: 40 });
    expect(presence(giant, 1, k, 200)).toBeGreaterThan(presence(ordinary, 1, k, 200) * 1.6);
  });

  it('reads as a solar system at fit zoom: sun and giant anchor it, debris stays smallest', () => {
    const z = 0;
    const k = 0.02;
    const tag = 200;
    const sun = presence(planetBody({ kind: 'sun', r: 26 }), z, k, tag);
    const planet = presence(planetBody({ kind: 'planet', count: 120, r: 12 }), z, k, tag);
    const giant = presence(planetBody({ kind: 'planet', giant: true, count: 120, r: 30 }), z, k, tag);
    const minor = presence(planetBody({ kind: 'minor', count: 40, r: 3.4 }), z, k, tag);
    const moon = presence(planetBody({ kind: 'moon', count: 4, r: 2 }), z, k, tag);
    const leaf = presence(planetBody({ kind: 'page', r: 0.85 }), z, k, tag);
    const rock = presence(planetBody({ kind: 'rock', r: 1.1 }), z, k, tag);

    expect(sun).toBeGreaterThan(planet);
    expect(giant).toBeGreaterThan(planet);
    expect(planet).toBeGreaterThan(minor);
    expect(minor).toBeGreaterThan(moon);
    expect(moon).toBeGreaterThan(leaf);
    expect(moon).toBeGreaterThan(rock);
  });

  it('holds planet glow off until you zoom in', () => {
    expect(glowSpread(1, false)).toBe(0);
    expect(glowSpread(2.39, true)).toBe(0);
    expect(glowSpread(2.4, false)).toBe(2.1);
    expect(glowSpread(2.4, true)).toBe(2.6);
  });
});

describe('zoom ladder', () => {
  it('derives kMax from content and keeps the fit-to-max range at most 400:1', () => {
    const { fitK, kMin, kMax } = solarScales(3400, 8, 1440, 900);
    expect(kMin).toBeCloseTo(fitK * 0.85);
    expect(kMax / fitK).toBeLessThanOrEqual(400);
    expect(solarZoomClamp(1e-9, kMin, kMax)).toBe(kMin);
    expect(solarZoomClamp(kMax + 10, kMin, kMax)).toBe(kMax);
  });

  it('centres the camera on a world point', () => {
    const camera = solarCamera({ x: 0, y: 0 }, 0.2, 800, 720);
    expect(camera.x).toBeCloseTo(400);
    expect(camera.y).toBeCloseTo(360);
  });

  it('advances the orbit clock from the speed control without jumping', () => {
    expect(advanceOrbitClock(0, 10000, 0.25, false)).toBe(2.5);
    expect(advanceOrbitClock(2.5, 1000, 1, false)).toBe(3.5);
    expect(advanceOrbitClock(5, 2000, 2, true)).toBe(0);
  });
});

describe('search hits', () => {
  it('resolves matching body indices once per query, never the sun', () => {
    const model = buildSolarModel(tagged('g', V0, 12, (i) => (i === 0 ? 'Alpha note' : `Note ${i}`)));
    const hits = resolveSearchHits(model, 'alpha');
    expect(hits.size).toBeGreaterThan(0);
    expect([...hits].every((idx) => model.bodies[idx]?.kind !== 'sun')).toBe(true);
    expect(resolveSearchHits(model, '   ').size).toBe(0);
  });
});

describe('fillDots', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills each overlapping same-color dot on its own path instead of unioning them into one shape', () => {
    const recorded = installCanvas();
    const dots = Array.from({ length: 6 }, (_, i) => ({
      x: i * 2,
      y: 0,
      r: 6,
      color: '#376fb7',
      alpha: 0.4
    }));
    fillDots(recorded.ctx as unknown as CanvasRenderingContext2D, dots);
    expect(recorded.fillGroups).toHaveLength(dots.length);
    expect(recorded.fillGroups.every((count) => count === 1)).toBe(true);
  });
});

describe('mountUniverseView', () => {
  beforeEach(() => {
    searchResolveStats.calls = 0;
    installCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never strokes a full-circle arc centred on a parent body', () => {
    const recorded = installCanvas();
    const frames = stubFrame();
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
    const stop = mountUniverseView(host, buildSolarModel(tagged('g', V0, 12)), {
      search: '',
      onNoteSelect() {}
    });
    frames.pump(16);
    expect(recorded.fullCircleStrokes).toHaveLength(0);
    stop();
  });

  it('resolves search hits once per query change, not per frame', () => {
    const frames = stubFrame();
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
    const model = buildSolarModel(tagged('g', V0, 12));
    const stop = mountUniverseView(host, model, { search: '', onNoteSelect() {} });
    frames.pump(16);
    const afterMount = searchResolveStats.calls;
    expect(afterMount).toBeGreaterThanOrEqual(1);
    frames.pump(32);
    frames.pump(48);
    expect(searchResolveStats.calls).toBe(afterMount);
    stop.setSearch('gifted');
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    frames.pump(64);
    frames.pump(80);
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    stop.setSearch('gifted');
    expect(searchResolveStats.calls).toBe(afterMount + 1);
    stop();
  });

  it('cancels its animation frame on teardown and keeps setSearch on the same canvas', () => {
    const frames = stubFrame();
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
    const stop = mountUniverseView(host, buildSolarModel([]), { search: '', onNoteSelect() {} });
    const canvas = host.children[0];
    const firstId = frames.callbacks.length;
    stop.setSearch('zzz');
    expect(host.children[0]).toBe(canvas);
    stop();
    expect(frames.cancel).toHaveBeenCalled();
    expect(frames.callbacks.length).toBe(firstId);
  });

  it('clicks a searched task and fires onNoteSelect with pageId, title, and excerpt', () => {
    const frames = stubFrame();
    const host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800, configurable: true });
    const entries = tagged('g', V0, 12, (i) => (i === 0 ? 'Zebra Unique Page' : `Note ${i}`));
    entries[0]!.excerpt = 'zebra excerpt';
    const model = buildSolarModel(entries);
    const onNoteSelect = vi.fn();
    const stop = mountUniverseView(host, model, { search: 'Zebra Unique', onNoteSelect });
    frames.pump(16);
    const target = model.bodies.find((body) => body.pageId === 'g0')!;
    const world = worldPos(target, model);
    const width = 800;
    const height = Math.max(720, Math.floor(window.innerHeight * 0.8));
    const { fitK } = solarScales(model.reach, model.tightest, width, height);
    const sx = width / 2 + world.x * fitK;
    const sy = height / 2 + world.y * fitK;
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON() {}
    });
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: sx, clientY: sy, bubbles: true }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: sx, clientY: sy, bubbles: true }));
    expect(onNoteSelect).toHaveBeenCalledWith({
      pageId: 'g0',
      title: 'Zebra Unique Page',
      excerpt: 'zebra excerpt'
    });
    stop();
  });
});
