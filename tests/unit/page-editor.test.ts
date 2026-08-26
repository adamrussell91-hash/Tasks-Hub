import { afterEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderPageEditor } from '@/views/page-editor';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getTask: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    getProject: vi.fn(),
    listTasks: vi.fn(),
    updateProject: vi.fn(),
    listTemplates: vi.fn()
  }
}));

function task(): Task {
  return {
    schema_version: 1,
    id: 'task_lesson',
    title: 'Finish lesson pack',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 45,
    actual_duration: null,
    due_date: '2026-08-17',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'high',
    parent_project_id: 'proj_mw',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    page_blocks: []
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
  current_end_date: null,
  review_summary: null,
  stall_flagged_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  competition_or_event_type: null,
  key_dates: null,
  student_group_reference: null,
  generated_admin_tasks: [],
  drafted_documents: null,
  page_blocks: []
};

describe('page editor', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('edits the title and task fields, and inserts blocks from the plus menu', async () => {
    vi.useFakeTimers();
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(task());

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' });

    expect(canvas.querySelector('.lesson-palette')).toBeNull();
    expect(canvas.querySelector('.page-card__back')?.textContent).toBe('← Board');
    expect(canvas.querySelector('.task-card__foot .btn')).toBeNull();

    expect(canvas.querySelector('select')).toBeNull();
    expect(canvas.querySelector('.page-card__domain')?.tagName).toBe('BUTTON');
    expect(canvas.querySelector('.page-card__status')?.classList.contains('hub-filter')).toBe(true);
    expect(canvas.querySelector('.page-card__notes')?.tagName).toBe('TEXTAREA');

    const title = canvas.querySelector<HTMLInputElement>('.page-card__title-input')!;
    expect(title.value).toBe('Finish lesson pack');
    title.value = 'Term brief rewrite';
    title.dispatchEvent(new Event('input', { bubbles: true }));

    canvas.querySelector<HTMLButtonElement>('.page-card__domain')!.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="life"]')!.click();

    await vi.advanceTimersByTimeAsync(400);
    expect(tasksApi.updateTask).toHaveBeenCalled();
    const fields = vi.mocked(tasksApi.updateTask).mock.calls.at(-1)?.[1] as {
      title: string;
      domain: string;
    };
    expect(fields.title).toBe('Term brief rewrite');
    expect(fields.domain).toBe('life');

    canvas.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    expect(canvas.querySelector('[data-block-type="heading"]')).not.toBeNull();
    expect(canvas.querySelector('[data-block-type="flashcards"]')).not.toBeNull();
    expect(canvas.querySelector('[data-block-type="equation"]')).not.toBeNull();

    canvas.querySelector<HTMLButtonElement>('[data-block-type="heading"]')!.click();
    expect(canvas.querySelector('select')).toBeNull();
    expect(canvas.querySelector('.block-editor__heading-variant')?.tagName).toBe('BUTTON');
    expect(canvas.querySelector('.block-editor__heading-text')).not.toBeNull();
    const field = canvas.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    field.value = 'Term brief';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(400);
    const patch = vi.mocked(tasksApi.updateTask).mock.calls.at(-1)?.[1] as {
      page_blocks: Array<{ block_type: string; content: { text?: string } }>;
    };
    expect(patch.page_blocks[0]?.block_type).toBe('heading');
    expect(patch.page_blocks[0]?.content.text).toBe('Term brief');
  });

  it('lists every Teaching Hub family in the plus menu', async () => {
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' });
    canvas.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();

    const labels = [...canvas.querySelectorAll('.page-editor__insert-label')].map((node) => node.textContent);
    expect(labels).toEqual(['Basic', 'Media', 'Teaching', 'Learning', 'Visualisation', 'Layout']);
  });

  it('shows the dated timeline and returns to Excursions on an excursion project', async () => {
    const excursion: Project = {
      ...project,
      id: 'proj_ex_ethics_seed',
      title: 'Ethics Olympiad heat',
      type: 'excursion',
      student_group_reference: 'Year 10 Ethics',
      current_end_date: '2026-10-10',
      competition_or_event_type: 'ext_ethics_olympiad',
      key_dates: {
        permission_note_due: '2026-09-24',
        staff_notification_due: '2026-09-24',
        risk_assessment_due: '2026-09-03',
        payment_due: '2026-09-17'
      },
      drafted_documents: {
        permission_note_draft: 'Permission note for Year 10 Ethics',
        staff_absence_email_draft: 'Staff absence: Ethics Olympiad'
      }
    };
    vi.mocked(tasksApi.getProject).mockResolvedValue(excursion);
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      {
        ...task(),
        id: 'task_permission',
        title: 'Draft permission note',
        parent_project_id: excursion.id,
        due_date: '2026-09-24',
        source: 'auto_generated_from_excursion'
      }
    ]);
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks: [],
      excursion_templates: [
        {
          schema_version: 1,
          id: 'ext_ethics_olympiad',
          name: 'Ethics Olympiad',
          default_lead_times: {
            permission_note_days: 21,
            staff_email_days: 21,
            risk_assessment_days: 42,
            payment_days: 28
          },
          checklist_items: []
        }
      ],
      task_templates: [],
      project_templates: []
    });

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'project', id: excursion.id });

    expect(canvas.querySelector('.hub-card__eyebrow')?.textContent).toBe('Excursion');
    expect(canvas.querySelector('.page-card__back')?.textContent).toBe('← Excursions');
    expect(canvas.querySelector<HTMLInputElement>('[aria-label="Student group"]')?.value).toBe(
      'Year 10 Ethics'
    );
    expect(canvas.querySelector('.excursion-progress .hub-track')).not.toBeNull();
    expect(canvas.querySelector('.excursion-timeline')).not.toBeNull();
    expect(canvas.querySelectorAll('.excursion-timeline__stop').length).toBeGreaterThan(1);
    expect(canvas.querySelector('.excursion-timeline__card .hub-row')?.textContent).toContain(
      'Draft permission note'
    );
    expect(canvas.textContent).toContain('Event');
    expect(canvas.querySelector('.excursion-detail summary')?.textContent).toBe('Drafted documents');
    expect(canvas.textContent).toContain('Permission note for Year 10 Ethics');

    expect(canvas.querySelector('.page-editor__add-btn')).not.toBeNull();
    canvas.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    const labels = [...canvas.querySelectorAll('.page-editor__insert-label')].map((node) => node.textContent);
    expect(labels).toEqual(['Basic', 'Media', 'Teaching', 'Learning', 'Visualisation', 'Layout']);
    expect(canvas.querySelector('[data-block-type="heading"]')).not.toBeNull();

    expect(canvas.querySelector<HTMLAnchorElement>('.page-card__back')?.getAttribute('href')).toBe(
      '#/excursions'
    );
  });
});
