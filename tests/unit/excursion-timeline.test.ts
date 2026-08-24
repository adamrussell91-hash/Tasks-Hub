import { describe, expect, it } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import {
  collectExcursionStops,
  layoutExcursionTimeline,
  TIMELINE_MIN_GAP,
  TIMELINE_PAD_TOP
} from '@/domain/excursion-timeline';

function project(partial: Partial<Project> = {}): Project {
  return {
    schema_version: 1,
    id: 'proj_ex',
    title: 'Ethics heat',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'excursion',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: '2026-10-10',
    review_summary: null,
    stall_flagged_at: null,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    competition_or_event_type: 'ext_ethics_olympiad',
    key_dates: {
      permission_note_due: '2026-09-24',
      staff_notification_due: '2026-09-24',
      risk_assessment_due: '2026-09-03',
      payment_due: '2026-09-17'
    },
    student_group_reference: 'Year 10 Ethics',
    generated_admin_tasks: [],
    drafted_documents: null,
    ...partial
  };
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: '2026-09-24',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    priority: 'medium',
    parent_project_id: 'proj_ex',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'auto_generated_from_excursion',
    ...partial
  };
}

describe('excursion timeline', () => {
  it('collects key dates and the event when there are no tasks', () => {
    const stops = collectExcursionStops(project(), []);
    expect(stops.map((stop) => stop.label)).toEqual([
      'Risk assessment',
      'Payment',
      'Permission note',
      'Staff notification',
      'Event'
    ]);
    expect(stops.at(-1)).toMatchObject({ kind: 'event', date: '2026-10-10' });
  });

  it('prefers a task card over a key-date chip on the same day', () => {
    const stops = collectExcursionStops(project(), [
      task({ id: 't1', title: 'Draft permission note', due_date: '2026-09-24' })
    ]);
    expect(stops.filter((stop) => stop.date === '2026-09-24').map((stop) => stop.kind)).toEqual(['task']);
    expect(stops.some((stop) => stop.label === 'Permission note')).toBe(false);
  });

  it('spaces later dates further down and keeps a min gap for same-day cards', () => {
    const layout = layoutExcursionTimeline([
      { id: 'a', date: '2026-09-03', kind: 'key_date', label: 'Risk', task: null },
      { id: 'b', date: '2026-09-03', kind: 'task', label: 'Lodge risk', task: null },
      { id: 'c', date: '2026-10-10', kind: 'event', label: 'Event', task: null }
    ]);
    expect(layout.stops[0]?.y).toBe(TIMELINE_PAD_TOP);
    expect(layout.stops[1]!.y - layout.stops[0]!.y).toBe(TIMELINE_MIN_GAP);
    expect(layout.stops[2]!.y - layout.stops[1]!.y).toBeGreaterThan(TIMELINE_MIN_GAP);
    expect(layout.stops[2]!.y).toBeGreaterThan(layout.stops[1]!.y);
  });
});
