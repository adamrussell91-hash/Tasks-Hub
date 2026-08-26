import { describe, expect, it, vi } from 'vitest';
import { renderExcursionsView } from '@/views/excursions';
import { tasksApi } from '@/services/client-api';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import type { Program } from '@/schemas/program';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    listTemplates: vi.fn(),
    listPrograms: vi.fn(),
    createExcursionFromTemplate: vi.fn(),
    deleteProject: vi.fn(),
    deleteTask: vi.fn()
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

const program: Program = {
  schema_version: 1,
  id: 'prog_ethics',
  name: 'Ethics Olympiad',
  types: ['Competition'],
  subjects: ['Philosophy'],
  month: 'October',
  age_groups: ['Year 10'],
  competition_level: 'All Abilities',
  competition_length: 'Single Day',
  location: 'Sydney',
  organiser: 'Ethics Olympiad',
  cost: '',
  cost_basis: null,
  description: '',
  registration_link: null,
  registration_window: '',
  not_available_nsw: false,
  not_available_reason: '',
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z'
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

function mockLists(projects: Project[] = [excursion]): void {
  vi.mocked(tasksApi.listProjects).mockResolvedValue(projects);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task]);
  vi.mocked(tasksApi.listTemplates).mockResolvedValue({
    frameworks: [],
    excursion_templates: [template],
    task_templates: [],
    project_templates: []
  });
  vi.mocked(tasksApi.listPrograms).mockResolvedValue([program]);
}

describe('excursions view', () => {
  it('keeps the list quiet until New excursion is clicked', async () => {
    mockLists();
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    expect(canvas.querySelector('.section-title')).toBeNull();
    expect(canvas.querySelector('.view-lede')).toBeNull();
    expect(canvas.querySelector('.excursion-create')).toBeNull();
    expect(canvas.textContent).not.toContain('Ethics Olympiad / Da Vinci');
    expect(canvas.querySelector('.btn')?.textContent).toBe('New excursion');

    canvas.querySelector<HTMLButtonElement>('.excursion-toolbar .btn')?.click();
    expect(canvas.querySelector('.excursion-create')).not.toBeNull();
    expect(canvas.querySelector('[aria-label="Program"]')).not.toBeNull();
    expect(canvas.querySelector('[aria-label="Title"]')).not.toBeNull();
    expect(canvas.querySelector('[aria-label^="Admin profile"]')).not.toBeNull();
    expect(canvas.textContent).toContain('School excursion');
    expect(canvas.querySelector('.excursion-preview')?.textContent).toMatch(/admin tasks · event /);
    expect(canvas.querySelector('.excursion-preview')?.textContent).not.toContain('permission −');
  });

  it('opens the create card when a template is handed off', async () => {
    mockLists();
    location.hash = '#/excursions?template=ext_ethics_olympiad';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    const title = canvas.querySelector<HTMLInputElement>('[aria-label="Title"]');
    expect(title?.value).toBe('Ethics Olympiad');
    expect(canvas.querySelector('[aria-label^="Admin profile"]')?.getAttribute('aria-label')).toContain(
      'Ethics Olympiad'
    );
  });

  it('opens the shared project page when a card is clicked', async () => {
    mockLists();
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

  it('deletes an excursion from the card menu after confirm', async () => {
    mockLists();
    vi.mocked(tasksApi.deleteProject).mockResolvedValue({ deleted: true });
    vi.mocked(tasksApi.deleteTask).mockResolvedValue({ deleted: true });
    location.hash = '#/excursions';
    const canvas = document.createElement('main');
    await renderExcursionsView(canvas);

    canvas.querySelector<HTMLButtonElement>('.card-menu')?.click();
    const deleteBtn = document.querySelector<HTMLButtonElement>('[data-card-menu-item="delete"]');
    expect(deleteBtn?.textContent).toBe('Delete');
    deleteBtn?.click();

    expect(canvas.querySelector('.confirm-card')).not.toBeNull();
    expect(canvas.textContent).toContain('Delete “Ethics Olympiad heat”?');
    const confirm = [...canvas.querySelectorAll('button')].find((btn) => btn.textContent === 'Delete');
    confirm?.click();
    await vi.waitFor(() => {
      expect(tasksApi.deleteTask).toHaveBeenCalledWith(
        'task_permission',
        expect.objectContaining({ reason: 'Card delete' })
      );
      expect(tasksApi.deleteProject).toHaveBeenCalledWith(
        'proj_ex_ethics_seed',
        expect.objectContaining({ reason: 'Card delete' })
      );
    });
  });
});
