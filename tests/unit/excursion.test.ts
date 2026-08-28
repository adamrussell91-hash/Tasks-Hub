import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import { buildExcursionPlan, defaultExcursionEventDate } from '@/domain/excursion';

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

describe('excursion plan', () => {
  it('schedules admin tasks from the single excursion template lead times', () => {
    expect(seed.excursion_templates).toHaveLength(1);
    const template = seed.excursion_templates.find((t) => t.id === 'ext_excursion')!;
    expect(template.name).toBe('excursion template');
    const plan = buildExcursionPlan(template, {
      title: 'Year 10 excursion',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10'
    });

    expect(plan.event_date).toBe('2026-10-15');
    expect(plan.key_dates.permission_note_due).toBe('2026-09-24'); // −21
    expect(plan.key_dates.staff_notification_due).toBe('2026-09-24'); // −21
    expect(plan.key_dates.risk_assessment_due).toBe('2026-09-03'); // −42
    expect(plan.key_dates.payment_due).toBe('2026-09-17'); // −28

    const kinds = plan.admin_tasks.map((t) => t.kind);
    expect(kinds).toContain('permission_note');
    expect(kinds).toContain('staff_email');
    expect(kinds).toContain('risk_assessment');
    expect(kinds).toContain('payment');
    expect(kinds).toContain('checklist'); // student list
    expect(kinds).toContain('event');

    expect(plan.drafted_documents.permission_note_draft).toContain('Year 10');
    expect(plan.drafted_documents.staff_absence_email_draft).toContain('Year 10 excursion');
    expect(plan.admin_tasks.some((t) => t.title.includes('Year 10 excursion'))).toBe(true);
  });
});

describe('defaultExcursionEventDate', () => {
  it('is 45 days from now', () => {
    expect(defaultExcursionEventDate(new Date('2026-08-28T00:00:00.000Z'))).toBe('2026-10-12');
  });
});

describe('createExcursionFromTemplate', () => {
  it('persists project, admin tasks, milestones, and drafts', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const { project, tasks } = await store.createExcursionFromTemplate({
      excursion_template_id: 'ext_excursion',
      title: 'Ethics State Round',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
    });

    expect(project.type).toBe('excursion');
    expect(project.competition_or_event_type).toBe('ext_excursion');
    expect(project.generated_admin_tasks.length).toBe(tasks.length);
    expect(tasks.every((t) => t.source === 'auto_generated_from_excursion')).toBe(true);
    expect(tasks.every((t) => t.parent_project_id === project.id)).toBe(true);
    expect(project.milestones.length).toBeGreaterThan(0);
    expect(project.drafted_documents?.permission_note_draft).toContain('Permission note');
    expect(project.key_dates?.risk_assessment_due).toBe('2026-09-03');
  });
});
