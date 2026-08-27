import { describe, expect, it } from 'vitest';
import {
  parseClareProposalJudgment,
  type ClareProposalJudge
} from '@/ai/clare-proposal-judge';
import { buildClareDumpDigest } from '@/domain/clare-digest';
import { parseBrainDump } from '@/domain/clare-dump';
import { assembleDumpResult } from '@/domain/clare';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('parseClareProposalJudgment', () => {
  const items = parseBrainDump('I really need to sort out my appraisal goal.', {
    now: new Date(2026, 7, 27),
    preferredDomain: 'teaching'
  });
  const digest = buildClareDumpDigest({
    text: 'I really need to sort out my appraisal goal.',
    items,
    frameworks: seed.frameworks,
    tasks: [],
    projects: [],
    calibrations: [],
    preferredDomain: 'teaching',
    now: new Date(2026, 7, 27)
  });

  it('parses fenced JSON proposals', () => {
    const judgment = parseClareProposalJudgment(
      '```json\n{"voice":"Right — one thing with a shape.","proposals":[{"item_index":0,"title":"Draft term 2 appraisal SMART goals","description":"","domain":"teaching","priority":"medium","due_date":null,"framework_id":"fw_timeboxing","reasoning":"Timeboxing — appraisal writing expands without a stop.","proposed_minutes":45}]}\n```',
      digest
    );
    expect(judgment.voice).toMatch(/one thing/);
    expect(judgment.proposals).toHaveLength(1);
    expect(judgment.proposals[0]?.title).toBe('Draft term 2 appraisal SMART goals');
    expect(judgment.proposals[0]?.framework_id).toBe('fw_timeboxing');
    expect(judgment.proposals[0]?.proposed_minutes).toBe(45);
  });

  it('rejects parrot titles that match raw dump when parser has a better fallback', () => {
    const judgment = parseClareProposalJudgment(
      JSON.stringify({
        proposals: [
          {
            item_index: 0,
            title: 'I really need to sort out my appraisal goal',
            framework_id: 'fw_timeboxing',
            reasoning: 'ok',
            proposed_minutes: 60
          }
        ]
      }),
      digest
    );
    expect(judgment.proposals[0]?.title).toBe('I really need to sort out my appraisal goal');
  });
});

describe('assembleDumpResult with judge', () => {
  it('uses LLM judgment for proposal cards', async () => {
    const items = parseBrainDump(
      'email parents about the excursion\nmarking year 9 essays due tomorrow',
      { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
    );
    const judge: ClareProposalJudge = async () => ({
      voice: 'Two things — both have a shape.',
      proposals: [
        {
          item_index: 0,
          title: 'Email parents re excursion permission',
          description: '',
          domain: 'teaching',
          priority: 'medium',
          due_date: null,
          framework_id: 'fw_timeboxing',
          reasoning: 'Quick comms still need a boundary.',
          proposed_minutes: 20
        },
        {
          item_index: 1,
          title: 'Mark Year 9 essay batch',
          description: '',
          domain: 'teaching',
          priority: 'medium',
          due_date: '2026-08-26',
          framework_id: 'fw_timeboxing',
          reasoning: 'Marking expands — box it.',
          proposed_minutes: 90
        }
      ],
      model: 'test-judge'
    });

    const result = assembleDumpResult(
      items,
      seed.frameworks,
      () => null,
      undefined,
      await judge(
        buildClareDumpDigest({
          text: 'email parents about the excursion\nmarking year 9 essays due tomorrow',
          items,
          frameworks: seed.frameworks,
          tasks: [],
          projects: [],
          calibrations: [],
          preferredDomain: 'teaching',
          now: new Date(2026, 7, 25)
        })
      )
    );

    expect(result.voice).toBe('Two things — both have a shape.');
    expect(result.proposals.map((p) => p.title)).toEqual([
      'Email parents re excursion permission',
      'Mark Year 9 essay batch'
    ]);
    expect(result.proposals[0]?.dump_kind).toBe('communication');
    expect(result.proposals[1]?.due_date).toBe('2026-08-26');
  });
});
