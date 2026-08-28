import { describe, expect, it, vi } from 'vitest';
import { renderExcursionsView } from '@/views/excursions';
import { tasksApi } from '@/services/client-api';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    listTemplates: vi.fn(),
    createExcursionFromTemplate: vi.fn()
  }
}));

const template: ExcursionTemplate = {
  schema_version: 1,
  id: 'ext_ethics_olympiad',
  name: 'Ethics Olympiad',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: ['Permission note drafted and sent']
};

const excursion: Project = {
  schema_version: 1,
  id: 'proj_ex_ethics_seed',
  title: 'Ethics Olympiad heat',
  description: 'Seed excursion',
  parent_goal_id: null,
  tags: [],
  arc_summary: 'Regional heat in October.',
  type: 'excursion',
  milestones: [],
  status: 'active',
  baseline_end_date: '2026-10-10',
  current_end_date: '2026-10-10',
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: 'ext_ethics_olympiad',
  key_dates: null,
  student_group_reference: 'Year 10 Ethics',
  generated_admin_tasks: [],
  drafted_documents: null
};

const task: Task = {
  schema_version: 1,
  id: 'task_permission',
  title: 'Draft permission note',
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
  blocked_since: null,
  priority: 'high',
  parent_project_id: 'proj_ex_ethics_seed',
  parent_task_id: null,
  depends_on: [],
  tags: ['excursion'],
  recurrence_rule: null,
  due_time: null,
  remind_at: null,
  remind_dismissed_at: null,
  attachments: [],
  source: 'auto_generated_from_excursion'
};

async function mount(): Promise<HTMLElement> {
  vi.mocked(tasksApi.listProjects).mockResolvedValue([excursion]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task]);
  vi.mocked(tasksApi.listTemplates).mockResolvedValue({
    frameworks: [],
    excursion_templates: [template],
    task_templates: [],
    project_templates: []
  });
  const canvas = document.createElement('main');
  await renderExcursionsView(canvas);
  return canvas;
}

describe('excursions view', () => {
  it('lists templates and cards without a create form', async () => {
    location.hash = '#/excursions';
    const canvas = await mount();

    expect(canvas.querySelector('form')).toBeNull();
    expect(canvas.textContent).not.toContain('Review & create');
    expect(canvas.querySelector('.task-row__title')?.textContent).toBe('Ethics Olympiad');
    expect(canvas.querySelector('.btn--primary')?.textContent).toBe('Use');

    const card = canvas.querySelector<HTMLElement>('.proj-row');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Ethics Olympiad heat');
    expect(card?.textContent).toContain('Excursion');

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
  });

  it('confirms a template then creates and opens the page', async () => {
    location.hash = '#/excursions';
    const created = { ...excursion, id: 'proj_new', title: 'Ethics Olympiad' };
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: created,
      tasks: [task]
    });
    const canvas = await mount();

    canvas.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    expect(canvas.querySelector('.confirm-card')).not.toBeNull();
    expect(tasksApi.createExcursionFromTemplate).not.toHaveBeenCalled();

    canvas.querySelector<HTMLButtonElement>('.btn--ghost')!.click();
    expect(canvas.querySelector('.confirm-card')).toBeNull();

    canvas.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(tasksApi.createExcursionFromTemplate).toHaveBeenCalledWith({
      excursion_template_id: 'ext_ethics_olympiad',
      title: 'Ethics Olympiad',
      event_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    });
    expect(location.hash).toBe('#/project/proj_new');
  });

  it('opens confirm when a template query is present', async () => {
    location.hash = '#/excursions?template=ext_ethics_olympiad';
    const canvas = await mount();
    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Ethics Olympiad”'
    );
  });
});
