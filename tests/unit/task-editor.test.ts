import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    recordClareActual: vi.fn()
  }
}));

function sampleTask(overrides: Partial<Task> = {}): Task {
  return {
    schema_version: 1,
    id: 'task_audit',
    title: 'Done cancel check',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: 'fw_timeboxing',
    estimated_duration: 55,
    actual_duration: null,
    due_date: '2026-08-22',
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
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

describe('renderQuickAdd', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.createTask).mockReset();
    vi.mocked(tasksApi.createTask).mockResolvedValue(sampleTask({ due_date: null }));
  });

  it('posts a new task without stamping due_date', async () => {
    const form = renderQuickAdd(() => undefined);
    expect(form.querySelector('select')).toBeNull();
    expect(form.querySelector('.hub-filter')?.tagName).toBe('BUTTON');
    expect(form.querySelector('.hub-search')?.tagName).toBe('LABEL');
    const title = form.querySelector('input') as HTMLInputElement;
    title.value = '[UX-AUDIT] backlog test';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    const body = vi.mocked(tasksApi.createTask).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.title).toBe('[UX-AUDIT] backlog test');
    expect(body).not.toHaveProperty('due_date');
  });

  it('stamps a due date only when the calendar quick-add asks for one', async () => {
    const form = renderQuickAdd(() => undefined, null, { dueDate: '2026-08-19' });
    const title = form.querySelector('input[aria-label="New task title"]') as HTMLInputElement;
    const due = form.querySelector('input[type="date"]') as HTMLInputElement;
    expect(due.value).toBe('2026-08-19');
    title.value = 'Calendar add';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(tasksApi.createTask).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(tasksApi.createTask).mock.calls[0]?.[0]).toMatchObject({
      title: 'Calendar add',
      due_date: '2026-08-19'
    });
  });
});

describe('requestToggleDone', () => {
  beforeEach(() => {
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.recordClareActual).mockReset();
  });

  it('leaves status unchanged when Discard is clicked on a Clare-estimated task', async () => {
    const host = document.createElement('div');
    const onDone = vi.fn();
    requestToggleDone(host, sampleTask(), onDone);

    expect(host.querySelector('.confirm-card')).not.toBeNull();
    host.querySelector<HTMLButtonElement>('.btn--ghost')?.click();

    expect(onDone).not.toHaveBeenCalled();
    expect(tasksApi.updateTask).not.toHaveBeenCalled();
    expect(tasksApi.recordClareActual).not.toHaveBeenCalled();
    expect(host.querySelector('.confirm-card')).toBeNull();
  });

  it('records actual minutes only after Confirm', async () => {
    vi.mocked(tasksApi.recordClareActual).mockResolvedValue(sampleTask({ status: 'done' }) as never);
    const host = document.createElement('div');
    const onDone = vi.fn().mockResolvedValue(undefined);
    requestToggleDone(host, sampleTask(), onDone);
    host.querySelector<HTMLButtonElement>('.btn--primary')?.click();
    await vi.waitFor(() => {
      expect(tasksApi.recordClareActual).toHaveBeenCalledWith('task_audit', 55);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
