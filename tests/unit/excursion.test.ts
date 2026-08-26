import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import {
  buildExcursionPlan,
  formatExcursionPreview,
  SCHOOL_EXCURSION_TEMPLATE,
  SCHOOL_EXCURSION_TEMPLATE_ID,
  suggestExcursionTemplate,
  withSchoolExcursionTemplate
} from '@/domain/excursion';

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
  it('schedules Ethics Olympiad admin tasks from lead times', () => {
    const template = seed.excursion_templates.find((t) => t.id === 'ext_ethics_olympiad')!;
    const plan = buildExcursionPlan(template, {
      title: 'Ethics Olympiad 2026',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
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

    expect(plan.drafted_documents.permission_note_draft).toContain('Year 10 Ethics team');
    expect(plan.drafted_documents.staff_absence_email_draft).toContain('Ethics Olympiad');
  });

  it('uses Da Vinci Decathlon lead times (different from Ethics)', () => {
    const template = seed.excursion_templates.find((t) => t.id === 'ext_da_vinci')!;
    const plan = buildExcursionPlan(template, {
      title: 'Da Vinci heat',
      event_date: '2026-10-15'
    });
    expect(plan.key_dates.permission_note_due).toBe('2026-09-17'); // −28
    expect(plan.key_dates.payment_due).toBe('2026-09-10'); // −35
    expect(plan.admin_tasks.some((t) => t.title.includes('Team registration'))).toBe(true);
  });
});

describe('createExcursionFromTemplate', () => {
  it('persists project, admin tasks, milestones, and drafts', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const { project, tasks } = await store.createExcursionFromTemplate({
      excursion_template_id: 'ext_ethics_olympiad',
      title: 'Ethics State Round',
      event_date: '2026-10-15',
      student_group_reference: 'Year 10 Ethics team'
    });

    expect(project.type).toBe('excursion');
    expect(project.competition_or_event_type).toBe('ext_ethics_olympiad');
    expect(project.generated_admin_tasks.length).toBe(tasks.length);
    expect(tasks.every((t) => t.source === 'auto_generated_from_excursion')).toBe(true);
    expect(tasks.every((t) => t.parent_project_id === project.id)).toBe(true);
    expect(project.milestones.length).toBeGreaterThan(0);
    expect(project.drafted_documents?.permission_note_draft).toContain('Permission note');
    expect(project.key_dates?.risk_assessment_due).toBe('2026-09-03');
  });

  it('creates from the in-memory school template when it is not in the store', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, {
      ...seed,
      excursion_templates: seed.excursion_templates.filter((item) => item.id !== SCHOOL_EXCURSION_TEMPLATE_ID)
    });
    const store = createTasksStore(kv, keys);
    const { project, tasks } = await store.createExcursionFromTemplate({
      excursion_template_id: SCHOOL_EXCURSION_TEMPLATE_ID,
      title: 'ABBMUN',
      event_date: '2026-03-18'
    });
    expect(project.type).toBe('excursion');
    expect(project.title).toBe('ABBMUN');
    expect(tasks.length).toBeGreaterThan(3);
  });
});

describe('excursion template matching', () => {
  it('suggests specialised profiles from a program name and keeps a generic fallback', () => {
    const ethics = seed.excursion_templates.find((item) => item.id === 'ext_ethics_olympiad')!;
    const daVinci = seed.excursion_templates.find((item) => item.id === 'ext_da_vinci')!;
    const templates = withSchoolExcursionTemplate([ethics, daVinci]);
    expect(suggestExcursionTemplate('Ethics Olympiad heat', templates).id).toBe('ext_ethics_olympiad');
    expect(suggestExcursionTemplate('Da Vinci Decathlon', templates).id).toBe('ext_da_vinci');
    expect(suggestExcursionTemplate('ABBMUN', templates).id).toBe(SCHOOL_EXCURSION_TEMPLATE_ID);
    expect(formatExcursionPreview(6, '2026-10-10')).toBe('6 admin tasks · event 10/10/26');
    expect(SCHOOL_EXCURSION_TEMPLATE.name).toBe('School excursion');
  });
});
