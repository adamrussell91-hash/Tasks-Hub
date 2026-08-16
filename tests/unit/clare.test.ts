import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import {
  applyCalibration,
  baseEstimateMinutes,
  buildProposal,
  emptyCalibration,
  recordNegotiationSample,
  selectFramework
} from '@/domain/clare';

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

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('clare framework selection', () => {
  it('picks Eat the Frog for backlog-style work', () => {
    const pick = selectFramework(
      {
        title: 'Finish lesson pack for Year 12',
        domain: 'teaching',
        backlog_titles: ['Finish lesson pack for Year 12']
      },
      seed.frameworks
    );
    expect(pick.framework.id).toBe('fw_eat_the_frog');
    expect(pick.reasoning.toLowerCase()).toContain('frog');
  });

  it('picks Timeboxing for marking batches', () => {
    const pick = selectFramework(
      { title: 'Marking batch for Year 9', domain: 'teaching' },
      seed.frameworks
    );
    expect(pick.framework.id).toBe('fw_timeboxing');
  });

  it('picks Eisenhower when deciding priorities', () => {
    const pick = selectFramework(
      { title: 'Decide which wedding vendor to prioritise', domain: 'wedding' },
      seed.frameworks
    );
    expect(pick.framework.id).toBe('fw_eisenhower');
  });
});

describe('clare estimates + calibration', () => {
  it('bases teaching marking estimates higher', () => {
    expect(baseEstimateMinutes({ title: 'Marking batch', domain: 'teaching' })).toBeGreaterThan(
      baseEstimateMinutes({ title: 'Quick email', domain: 'teaching' })
    );
  });

  it('learns from overrides toward Adam’s accepted minutes', () => {
    let cal = emptyCalibration('teaching', '2026-08-16T00:00:00.000Z');
    cal = recordNegotiationSample(cal, 60, 90, '2026-08-16T01:00:00.000Z');
    cal = recordNegotiationSample(cal, 60, 90, '2026-08-16T02:00:00.000Z');
    expect(cal.sample_count).toBe(2);
    expect(cal.recent_deltas).toEqual([30, 30]);
    const applied = applyCalibration(60, cal);
    expect(applied.minutes).toBeGreaterThan(60);
    expect(applied.note).toMatch(/add about/i);
  });

  it('builds a full proposal', () => {
    const proposal = buildProposal(
      { title: 'Draft unit overview', domain: 'teaching', priority: 'high' },
      seed.frameworks,
      null
    );
    expect(proposal.proposed_minutes).toBeGreaterThan(0);
    expect(proposal.framework_id).toBeTruthy();
    expect(proposal.reasoning.length).toBeGreaterThan(10);
  });
});

describe('clare store negotiation', () => {
  it('proposes, accepts, and records actuals through the shared store', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const proposal = await store.proposeWithClare({
      title: 'Marking batch for Year 10',
      domain: 'teaching',
      priority: 'high'
    });
    expect(proposal.framework_name).toBe('Timeboxing');

    const accepted = proposal.proposed_minutes + 15;
    const { task, negotiation, calibration } = await store.acceptClareProposal({
      proposal,
      accepted_minutes: accepted
    });
    expect(task.source).toBe('suggested_by_agent');
    expect(task.estimated_duration).toBe(accepted);
    expect(negotiation.proposed_minutes).toBe(proposal.proposed_minutes);
    expect(calibration.sample_count).toBe(1);

    const { task: done, calibration: afterActual } = await store.recordClareActual(task.id, accepted - 5);
    expect(done.status).toBe('done');
    expect(done.actual_duration).toBe(accepted - 5);
    expect(afterActual?.actual_sample_count).toBe(1);
  });
});
