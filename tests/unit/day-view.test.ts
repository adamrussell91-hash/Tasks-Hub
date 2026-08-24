import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { toDateKey } from '@/domain/queries';
import { renderDayView, resetDayViewState } from '@/views/dashboard';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    recordClareActual: vi.fn()
  }
}));

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    schema_version: 1,
    id: 'task_day',
    title: 'Existing today',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: null,
    actual_duration: null,
    due_date: toDateKey(new Date()),
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...overrides
  };
}

describe('renderDayView', () => {
  beforeEach(() => {
    resetDayViewState();
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue([]);
    vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
    vi.mocked(tasksApi.createTask).mockImplementation(async (body) => {
      const input = body as { title: string; due_date?: string; domain?: Task['domain'] };
      return sampleTask({
        id: 'task_just_added',
        title: input.title,
        due_date: input.due_date ?? null,
        domain: input.domain ?? 'teaching',
        updated_at: new Date().toISOString()
      });
    });
  });

  it('expands a Today card on click', async () => {
    vi.mocked(tasksApi.listTasks).mockResolvedValue([
      sampleTask({ id: 'task_today_card', title: 'Finish lesson pack' })
    ]);
    const canvas = document.createElement('main');
    await renderDayView(canvas);

    const slot = canvas.querySelector<HTMLElement>('.hub-card-slot[data-task-id="task_today_card"]');
    expect(slot?.dataset.state).toBe('compact');
    slot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => {
      expect(slot?.dataset.state).toBe('expanded');
    });
    expect(slot?.querySelector('.hub-card__title')?.textContent).toBe('Finish lesson pack');
  });

  it('stamps today and shows the new task without waiting for a fresh list', async () => {
    const canvas = document.createElement('main');
    await renderDayView(canvas);
    expect(canvas.textContent).toMatch(/Nothing due today/);

    const form = canvas.querySelector('form.quick-add') as HTMLFormElement;
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    const due = form.querySelector('input[type="date"]') as HTMLInputElement;
    expect(due.value).toBe(toDateKey(new Date()));
    title.value = 'Call the school';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Call the school',
      due_date: toDateKey(new Date())
    });

    await vi.waitFor(() => {
      expect(canvas.textContent).toContain('Call the school');
    });
    expect(canvas.textContent).not.toMatch(/Nothing due today/);
  });
});
