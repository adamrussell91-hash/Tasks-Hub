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
    updateProject: vi.fn()
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

  it('mounts the Teaching Hub lesson palette and persists a heading block', async () => {
    vi.useFakeTimers();
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);
    vi.mocked(tasksApi.updateTask).mockResolvedValue(task());

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' });

    expect(canvas.querySelector('.lesson-palette')).not.toBeNull();
    expect(canvas.querySelector('.lesson-page')).not.toBeNull();
    expect(canvas.querySelector('.page-card .hub-card__title')?.textContent).toBe('Finish lesson pack');

    const basic = canvas.querySelector<HTMLButtonElement>(
      '.lesson-palette__family[data-family="Basic"]'
    );
    expect(basic).not.toBeNull();
    basic!.click();

    const heading = canvas.querySelector<HTMLButtonElement>(
      '.lesson-palette__card[data-block-type="heading"]'
    );
    expect(heading).not.toBeNull();
    heading!.click();

    expect(canvas.querySelector('.block-editor__heading-text')).not.toBeNull();
    const field = canvas.querySelector<HTMLInputElement>('.block-editor__heading-text')!;
    field.value = 'Term brief';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.advanceTimersByTimeAsync(400);
    expect(tasksApi.updateTask).toHaveBeenCalled();
    const patch = vi.mocked(tasksApi.updateTask).mock.calls.at(-1)?.[1] as {
      page_blocks: Array<{ block_type: string; content: { text?: string } }>;
    };
    expect(patch.page_blocks[0]?.block_type).toBe('heading');
    expect(patch.page_blocks[0]?.content.text).toBe('Term brief');
  });

  it('exposes every Teaching Hub lesson family, not the six-block stub', async () => {
    vi.mocked(tasksApi.getTask).mockResolvedValue(task());
    vi.mocked(tasksApi.listProjects).mockResolvedValue([project]);

    const canvas = document.createElement('main');
    await renderPageEditor(canvas, { kind: 'task', id: 'task_lesson' });

    const families = [...canvas.querySelectorAll<HTMLButtonElement>('.lesson-palette__family')].map(
      (btn) => btn.dataset.family
    );
    expect(families).toEqual(['Basic', 'Media', 'Teaching', 'Learning', 'Visualisation', 'Layout']);

    const media = canvas.querySelector<HTMLButtonElement>(
      '.lesson-palette__family[data-family="Media"]'
    )!;
    media.click();
    expect(canvas.querySelector('[data-block-type="image"]')).not.toBeNull();
    expect(canvas.querySelector('[data-block-type="video"]')).not.toBeNull();

    const learning = canvas.querySelector<HTMLButtonElement>(
      '.lesson-palette__family[data-family="Learning"]'
    )!;
    learning.click();
    const flashcards = canvas.querySelector<HTMLButtonElement>('[data-block-type="flashcards"]')!;
    flashcards.click();
    expect(canvas.querySelector('.block-editor__flashcards-items')).not.toBeNull();

    const visualisation = canvas.querySelector<HTMLButtonElement>(
      '.lesson-palette__family[data-family="Visualisation"]'
    )!;
    visualisation.click();
    const equation = canvas.querySelector<HTMLButtonElement>('[data-block-type="equation"]')!;
    equation.click();
    expect(canvas.querySelectorAll('.lesson-page__block').length).toBeGreaterThanOrEqual(2);
  });
});
