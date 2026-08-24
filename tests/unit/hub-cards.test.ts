import { describe, expect, it, vi } from 'vitest';
import { mountProjectCard, mountTaskCard } from '@/views/hub-cards';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: 'A note',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: '2026-08-17',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    priority: 'high',
    parent_project_id: 'proj_mw',
    parent_task_id: null,
    depends_on: [],
    tags: ['brief'],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

const project: Project = {
  schema_version: 1,
  id: 'proj_mw',
  title: 'MindWorks',
  description: '',
  parent_goal_id: null,
  tags: [],
  arc_summary: '',
  type: 'academic_program',
  milestones: [],
  status: 'active',
  baseline_end_date: null,
  current_end_date: '2026-08-29',
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null
};

describe('hub cards', () => {
  it('renders a Cotton Glass micro task card and expands in place', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);

    const host = document.createElement('div');
    const slot = mountTaskCard(host, task({ id: 'task_lesson', title: 'Finish lesson pack' }), {});
    expect(slot.querySelector('.hub-row__title')?.textContent).toBe('Finish lesson pack');
    expect(slot.querySelector('.hub-chip')?.textContent).toBe('Teaching');
    expect(slot.querySelector('.priority-chip')?.textContent).toBe('high');
    expect(slot.dataset.state).toBe('compact');

    slot.querySelector('.hub-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.state).toBe('expanded');
    expect(slot.querySelector('.hub-card__title')?.textContent).toBe('Finish lesson pack');
    expect(slot.querySelector('button')?.textContent).toBe('Open page');
  });

  it('keeps the sprint-board card contract on list items', () => {
    const list = document.createElement('ul');
    const slot = mountTaskCard(list, task({ id: 'task_a', title: 'Alpha' }), {}, true);
    expect(slot.classList.contains('card')).toBe(true);
    expect(slot.dataset.id).toBe('task_a');
    expect(slot.querySelector('.card-title')?.textContent).toBe('Alpha');
  });

  it('expands a project card to the progress checklist', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);

    const host = document.createElement('div');
    const slot = mountProjectCard(host, project, [
      task({ id: 'a', title: 'Lock brief', status: 'done' }),
      task({ id: 'b', title: 'Write case study', due_date: '2026-08-17' })
    ]);
    slot.querySelector('.proj-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(slot.dataset.state).toBe('expanded');
    expect(slot.querySelector('.hub-hero-metric')?.textContent).toContain('50');
    expect(slot.querySelectorAll('.task-item')).toHaveLength(2);
    expect(slot.textContent).toContain('Open page');
  });

  it('opens via onActivate instead of expanding when that handler is set', () => {
    const host = document.createElement('div');
    const onActivate = vi.fn();
    const slot = mountProjectCard(host, { ...project, type: 'excursion' }, [], { onActivate });
    slot.querySelector('.proj-row')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'proj_mw' }));
    expect(slot.dataset.state).toBe('compact');
  });
});
