import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';
import {
  buildMorningSweep,
  buildTomorrowSetup,
  buildWeeklyReset,
  findHighStakesTasks
} from '@/domain/clare-desk';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

const now = new Date(2026, 7, 25, 9, 0, 0);

describe('clare desk briefings', () => {
  it('flags stale high-stakes work from the seed', () => {
    const stakes = findHighStakesTasks(seed.tasks, now);
    expect(stakes.map((t) => t.title)).toContain('Lock MindWorks term brief');
    expect(stakes.every((t) => t.priority === 'high' || t.priority === 'urgent')).toBe(true);
  });

  it('leads the morning sweep with the stuck deadline and ends with dump away', () => {
    const briefing = buildMorningSweep(seed.tasks, now);
    expect(briefing.lead).toMatch(/one thing before we start/i);
    expect(briefing.lead).toMatch(/has not moved/i);
    expect(briefing.closer).toBe('That is your day. Dump away.');
    const words = [briefing.lead, briefing.closer, ...briefing.sections.flatMap((s) => s.lines)]
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length).toBeLessThan(300);
  });

  it('tomorrow setup asks what to carry forward', () => {
    const briefing = buildTomorrowSetup(seed.tasks, now);
    expect(briefing.closer).toMatch(/reschedule|carry forward|close/i);
    expect(briefing.sections.length).toBeGreaterThan(0);
  });

  it('weekly reset names overdue decisions', () => {
    const briefing = buildWeeklyReset(seed.tasks, now);
    expect(briefing.sections.some((s) => /decide|week/i.test(s.heading))).toBe(true);
  });
});
