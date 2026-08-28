import { describe, expect, it, vi } from 'vitest';
import { renderExcursionsView, renderNewExcursionPage } from '@/views/excursions';
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

function mockList() {
  vi.mocked(tasksApi.listProjects).mockResolvedValue([excursion]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task]);
  vi.mocked(tasksApi.listTemplates).mockResolvedValue({
    frameworks: [],
    excursion_templates: [template],
    task_templates: [],
    project_templates: []
  });
}

describe('excursions list', () => {
  it('opens the shared project page when a card is clicked', async () => {
    mockList();
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    const card = canvas.querySelector<HTMLElement>('.proj-row');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Ethics Olympiad heat');
    expect(card?.textContent).toContain('Excursion');

    card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
  });

  it('uses a plus button instead of an inline create form', async () => {
    mockList();
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    const add = canvas.querySelector<HTMLButtonElement>('.excursions-add');
    expect(add?.getAttribute('aria-label')).toBe('New excursion');
    expect(canvas.querySelector('.excursion-form')).toBeNull();
    expect(canvas.textContent).not.toContain('Active excursions');
    expect(canvas.textContent).not.toContain('Excursions are projects');
    expect(canvas.textContent).not.toContain('Review & create');

    add?.click();
    expect(location.hash).toBe('#/excursions/new');
  });

  it('sends a template query to the new excursion page', async () => {
    mockList();
    location.hash = '#/excursions?template=ext_ethics_olympiad';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);
    expect(location.hash).toBe('#/excursions/new?template=ext_ethics_olympiad');
    expect(canvas.querySelector('.proj-row')).toBeNull();
  });
});

describe('new excursion page', () => {
  it('is the excursion page and creates after confirm', async () => {
    mockList();
    vi.mocked(tasksApi.createExcursionFromTemplate).mockResolvedValue({
      project: excursion,
      tasks: [task]
    });
    location.hash = '#/excursions/new?template=ext_ethics_olympiad';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);

    expect(canvas.querySelector('.excursion-page')).not.toBeNull();
    expect(canvas.querySelector('.hub-card__eyebrow')?.textContent).toBe('Excursion');
    const title = canvas.querySelector<HTMLInputElement>('[aria-label="Title"]');
    expect(title?.value).toBe('Ethics Olympiad');
    expect(canvas.querySelector('[aria-label="Event date"]')).not.toBeNull();
    expect(canvas.querySelector('[aria-label="Student group"]')).not.toBeNull();

    title!.value = 'Ethics heat';
    canvas.querySelector<HTMLFormElement>('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    expect(canvas.querySelector('.confirm-card .page-header__title')?.textContent).toBe(
      'Create “Ethics heat”'
    );

    canvas.querySelector<HTMLButtonElement>('.confirm-card .btn--primary')?.click();
    await vi.waitFor(() => {
      expect(tasksApi.createExcursionFromTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          excursion_template_id: 'ext_ethics_olympiad',
          title: 'Ethics heat'
        })
      );
      expect(location.hash).toBe('#/project/proj_ex_ethics_seed');
    });
  });

  it('returns to the list from Back to Excursions', async () => {
    mockList();
    location.hash = '#/excursions/new';
    const canvas = document.createElement('main');
    await renderNewExcursionPage(canvas);
    const back = [...canvas.querySelectorAll('button')].find((btn) =>
      btn.textContent?.includes('Back to Excursions')
    );
    back?.click();
    expect(location.hash).toBe('#/excursions');
  });
});
