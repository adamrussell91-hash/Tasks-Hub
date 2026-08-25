import { describe, expect, it } from 'vitest';
import { parseBrainDump, splitDumpLines } from '@/domain/clare-dump';
import { assembleDumpResult } from '@/domain/clare';
import type { FrameworkEntry } from '@/schemas/templates';

const frameworks: FrameworkEntry[] = [
  {
    schema_version: 1,
    id: 'fw_timeboxing',
    name: 'Timeboxing',
    best_suited_task_pattern: 'Open-ended work',
    reasoning_template: 'Put a boundary around the work.'
  },
  {
    schema_version: 1,
    id: 'fw_eat_the_frog',
    name: 'Eat the Frog',
    best_suited_task_pattern: 'Stuck work',
    reasoning_template: 'Eat the Frog, because this has been sitting untouched.'
  },
  {
    schema_version: 1,
    id: 'fw_eisenhower',
    name: 'Eisenhower matrix',
    best_suited_task_pattern: 'Priorities',
    reasoning_template: 'Eisenhower, because urgency and importance are fighting.'
  }
];

describe('brain dump parsing', () => {
  it('splits lines, bullets, and and-then without breaking Year 9 and 10', () => {
    expect(
      splitDumpLines('Email parents\n- marking year 9 and 10\nand then book the GP')
    ).toEqual(['Email parents', 'marking year 9 and 10', 'book the GP']);
  });

  it('classifies comms, dates, domains, and notes', () => {
    const items = parseBrainDump(
      'email parents about the excursion\nmarking year 9 essays due tomorrow\nremember: dex at 4\nflorist quote',
      { now: new Date(2026, 7, 25), preferredDomain: 'teaching' }
    );
    expect(items).toHaveLength(4);
    const email = items.find((i) => /email/i.test(i.title))!;
    expect(email.kind).toBe('communication');
    expect(email.domain).toBe('teaching');
    const marking = items.find((i) => /marking/i.test(i.title))!;
    expect(marking.title).toBe('Marking year 9 essays');
    expect(marking.due_date).toBe('2026-08-26');
    expect(marking.domain).toBe('teaching');
    const note = items.find((i) => /dex/i.test(i.title))!;
    expect(note.kind).toBe('note');
    const florist = items.find((i) => /florist/i.test(i.title))!;
    expect(florist.domain).toBe('wedding');
    expect(florist.question).toMatch(/due date|living its best life/i);
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.voice).toMatch(/1 looks like a note/);
    expect(result.proposals.map((p) => p.title)).toEqual([
      'Email parents about the excursion',
      'Marking year 9 essays',
      'Florist quote'
    ]);
  });

  it('does not propose notes or existing titles', () => {
    const items = parseBrainDump('Finish lesson pack for Year 12\nremember: bring the USB', {
      now: new Date(2026, 7, 25),
      tasks: [
        {
          schema_version: 1,
          id: 't1',
          title: 'Finish lesson pack for Year 12',
          description: '',
          kind: 'task',
          bucket: 'active',
          step_order: 0,
          domain: 'teaching',
          framework_used: null,
          estimated_duration: 60,
          actual_duration: null,
          due_date: '2026-08-17',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
          completed_at: null,
          status: 'open',
          blocked_since: null,
          priority: 'high',
          parent_project_id: null,
          parent_task_id: null,
          depends_on: [],
          tags: [],
          recurrence_rule: null,
          due_time: null,
          remind_at: null,
          remind_dismissed_at: null,
          attachments: [],
          source: 'manual'
        }
      ]
    });
    const result = assembleDumpResult(items, frameworks, () => null);
    expect(result.proposals).toHaveLength(0);
    expect(result.questions.some((q) => /already on the board/i.test(q))).toBe(true);
    expect(result.notes.some((n) => /usb/i.test(n))).toBe(true);
  });
});
