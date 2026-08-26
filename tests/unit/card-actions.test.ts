import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { deleteTaskNow, setTaskDomainNow } from '@/views/card-actions';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    deleteTask: vi.fn(),
    updateTask: vi.fn()
  }
}));

function sample(): Task {
  return {
    schema_version: 1,
    id: 'task_gone',
    title: 'Outline MindWorks units',
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
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
    source: 'manual'
  };
}

describe('deleteTaskNow', () => {
  it('deletes immediately and never paints a proposed-write card', async () => {
    vi.mocked(tasksApi.deleteTask).mockResolvedValue(undefined as never);
    const host = document.createElement('div');
    const reload = vi.fn();
    deleteTaskNow(sample(), reload, host);
    expect(host.querySelector('.confirm-card')).toBeNull();
    expect(host.textContent).not.toContain('Proposed write');
    await vi.waitFor(() => expect(tasksApi.deleteTask).toHaveBeenCalledWith('task_gone', {
      agent: 'Tasks Hub',
      reason: 'Card delete'
    }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('surfaces an API error on the host instead of a confirm banner', async () => {
    vi.mocked(tasksApi.deleteTask).mockRejectedValue(new Error('No.'));
    const host = document.createElement('div');
    deleteTaskNow(sample(), vi.fn(), host);
    await vi.waitFor(() => expect(host.textContent).toContain('No.'));
    expect(host.querySelector('.confirm-card')).toBeNull();
  });
});

describe('setTaskDomainNow', () => {
  afterEach(() => {
    vi.mocked(tasksApi.updateTask).mockReset();
  });

  it('patches domain immediately and never paints a proposed-write card', async () => {
    const current = sample();
    const updated = { ...current, domain: 'life' as const };
    vi.mocked(tasksApi.updateTask).mockResolvedValue(updated as never);
    const onUpdated = vi.fn();
    const onError = vi.fn();
    setTaskDomainNow(current, 'life', onUpdated, onError);
    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith('task_gone', { domain: 'life' });
    });
    expect(onUpdated).toHaveBeenCalledWith(updated);
    expect(onError).not.toHaveBeenCalled();
  });

  it('skips the write when the domain is unchanged', () => {
    const onUpdated = vi.fn();
    setTaskDomainNow(sample(), 'teaching', onUpdated);
    expect(tasksApi.updateTask).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('forwards API errors without a confirm banner', async () => {
    vi.mocked(tasksApi.updateTask).mockRejectedValue(new Error('No.'));
    const onUpdated = vi.fn();
    const onError = vi.fn();
    setTaskDomainNow(sample(), 'health', onUpdated, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('No.'));
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
