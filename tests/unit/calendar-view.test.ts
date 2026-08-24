import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderMonthView, renderWeekView, resetCalendarSession } from '@/views/calendar';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn()
  }
}));

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
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
    parent_project_id: 'proj_mindworks',
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

const projects: Project[] = [
  {
    schema_version: 1,
    id: 'proj_mindworks',
    title: 'MindWorks',
    description: '',
    parent_goal_id: null,
    tags: [],
    arc_summary: '',
    type: 'academic_program',
    milestones: [
      {
        id: 'ms_brief',
        project_id: 'proj_mindworks',
        title: 'Term brief locked',
        due_date: '2026-08-22',
        status: 'open'
      }
    ],
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
    drafted_documents: null
  }
];

const tasks: Task[] = [
  task({ id: 'task_lesson', title: 'Finish lesson pack', due_date: '2026-08-17' }),
  task({
    id: 'task_florist',
    title: 'Reply to florist',
    due_date: '2026-08-18',
    domain: 'wedding',
    parent_project_id: null
  }),
  task({
    id: 'task_done',
    title: 'Already done',
    due_date: '2026-08-17',
    status: 'done'
  })
];

describe('calendar views', () => {
  beforeEach(() => {
    resetCalendarSession();
    location.hash = '#/month?date=2026-08-17';
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue(tasks);
    vi.mocked(tasksApi.listProjects).mockResolvedValue(projects);
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id, body) => {
      const found = tasks.find((entry) => entry.id === id)!;
      return { ...found, ...(body as Partial<Task>) };
    });
    vi.mocked(tasksApi.createTask).mockImplementation(async (body) => {
      const input = body as { title: string; due_date?: string; domain?: Task['domain'] };
      return task({
        id: `task_new_${input.title}`,
        title: input.title,
        due_date: input.due_date ?? '2026-08-17',
        domain: input.domain ?? 'teaching',
        parent_project_id: null
      });
    });
  });

  it('renders a real month grid with tasks, milestones, and overflow hooks', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);

    expect(canvas.querySelectorAll('.month-cal__cell')).toHaveLength(42);
    expect([...canvas.querySelectorAll('.month-cal__head')].map((node) => node.textContent)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun'
    ]);
    expect(canvas.querySelector('[data-task-id="task_lesson"]')?.textContent).toBe('Finish lesson pack');
    expect(canvas.querySelector('[data-kind="milestone"]')?.textContent).toBe('Term brief locked');
    expect(canvas.querySelector('.calendar-nav__label')?.textContent).toMatch(/August 2026/);
    expect(canvas.querySelector('[data-date="2026-08-17"][data-kind="task"]')).not.toBeNull();
  });

  it('keeps completed work off the grid until the Completed layer is on', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    expect(canvas.querySelector('[data-task-id="task_done"]')).toBeNull();

    canvas.querySelector<HTMLButtonElement>('[aria-pressed="false"]')?.click();
    expect(canvas.textContent).toMatch(/Already done/);
  });

  it('opens the task editor from a month chip', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    canvas.querySelector<HTMLButtonElement>('[data-task-id="task_lesson"]')?.click();
    await vi.waitFor(() => {
      expect(canvas.querySelector('.task-editor')).not.toBeNull();
    });
    expect(canvas.querySelector('.task-editor [aria-label="Title"]')).toBeTruthy();
  });

  it('renders seven week columns and a dated quick-add on the selected day', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    expect(canvas.querySelectorAll('.week-col')).toHaveLength(7);
    expect(canvas.querySelector('[data-task-id="task_lesson"]')).not.toBeNull();
    expect(canvas.querySelector('[data-task-id="task_florist"]')).not.toBeNull();
    const due = canvas.querySelector<HTMLInputElement>('.calendar-agenda input[type="date"]');
    expect(due?.value).toBe('2026-08-17');
    expect(canvas.querySelector('.calendar-nav__label')?.textContent).toMatch(/17\/08\/26/);
  });

  it('reschedules a task when it is dropped on another day', async () => {
    location.hash = '#/week?date=2026-08-17';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const friday = canvas.querySelector<HTMLElement>('.week-col[data-date="2026-08-21"]')!;
    const transfer = {
      data: { 'text/task-id': 'task_lesson', 'text/plain': 'task_lesson' } as Record<string, string>,
      getData(type: string) {
        return this.data[type] ?? '';
      },
      setData(type: string, value: string) {
        this.data[type] = value;
      },
      effectAllowed: 'move',
      dropEffect: 'move'
    };
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    friday.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('task_lesson', { due_date: '2026-08-21' });
    });
  });

  it('adds a task on the selected calendar day', async () => {
    location.hash = '#/week?date=2026-08-19';
    const canvas = document.createElement('main');
    await renderWeekView(canvas);

    const form = canvas.querySelector('.calendar-agenda .quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    title.value = 'Prep excursion bags';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Prep excursion bags',
      due_date: '2026-08-19'
    });
    // listTasks stays stale on purpose — the created task must still paint.
    expect(vi.mocked(tasksApi.listTasks).mock.calls.length).toBe(1);
    await vi.waitFor(() => {
      expect(canvas.textContent).toContain('Prep excursion bags');
    });
    expect(canvas.querySelector('[data-date="2026-08-19"][data-kind="task"]')?.textContent).toBe(
      'Prep excursion bags'
    );
  });

  it('moves the month with Next and keeps a calendar grid', async () => {
    const canvas = document.createElement('main');
    await renderMonthView(canvas);
    canvas.querySelector<HTMLButtonElement>('[aria-label="Next month"]')?.click();
    expect(canvas.querySelectorAll('.month-cal__cell')).toHaveLength(42);
    expect(canvas.querySelector('.calendar-nav__label')?.textContent).toMatch(/September 2026/);
  });
});
