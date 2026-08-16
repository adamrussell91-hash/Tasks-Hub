import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type {
  FrameworkEntry,
  ExcursionTemplate,
  TaskTemplate,
  ProjectTemplate
} from '@/schemas/templates';

/** Browser client that mirrors the shared TasksStore surface (Clare will use the same server store). */
export const tasksApi = {
  listTasks: () => apiGet<{ tasks: Task[] }>('/api/tasks').then((r) => r.tasks),
  getTask: (id: string) => apiGet<Task>(`/api/tasks?id=${encodeURIComponent(id)}`),
  createTask: (body: unknown) => apiPost<Task>('/api/tasks', body),
  updateTask: (id: string, body: unknown) =>
    apiPatch<Task>(`/api/tasks?id=${encodeURIComponent(id)}`, body),
  deleteTask: (id: string, meta?: { agent?: string; reason?: string }) =>
    apiDelete<{ deleted: boolean }>(`/api/tasks?id=${encodeURIComponent(id)}`, meta),

  listProjects: () => apiGet<{ projects: Project[] }>('/api/projects').then((r) => r.projects),
  getProject: (id: string) => apiGet<Project>(`/api/projects?id=${encodeURIComponent(id)}`),
  createProject: (body: unknown) => apiPost<Project>('/api/projects', body),
  updateProject: (id: string, body: unknown) =>
    apiPatch<Project>(`/api/projects?id=${encodeURIComponent(id)}`, body),
  deleteProject: (id: string, meta?: { agent?: string; reason?: string }) =>
    apiDelete<{ deleted: boolean }>(`/api/projects?id=${encodeURIComponent(id)}`, meta),

  listTemplates: () =>
    apiGet<{
      frameworks: FrameworkEntry[];
      excursion_templates: ExcursionTemplate[];
      task_templates: TaskTemplate[];
      project_templates: ProjectTemplate[];
    }>('/api/templates'),

  saveTaskAsTemplate: (task_id: string, name: string) =>
    apiPost<TaskTemplate>('/api/templates', { action: 'save_task_as_template', task_id, name }),

  createTaskFromTemplate: (template_id: string, overrides?: unknown) =>
    apiPost<Task>('/api/templates', {
      action: 'create_task_from_template',
      template_id,
      overrides
    }),

  listStressFlags: () =>
    apiGet<{ flags: import('@/schemas/stress').StressFlag[] }>('/api/stress-flags').then(
      (r) => r.flags
    ),

  listAgentInbox: (inbox: string) =>
    apiGet<{ flags: import('@/schemas/stress').StressFlag[]; inbox: string }>(
      `/api/stress-flags?inbox=${encodeURIComponent(inbox)}`
    ).then((r) => r.flags),

  scanStressFlags: () =>
    apiPost<{
      raised: import('@/schemas/stress').StressFlag[];
      skipped: number;
      patterns: number;
    }>('/api/stress-flags', { action: 'scan' }),

  raiseStressFlag: (body: {
    pattern_description: string;
    pattern_kind?: string;
    source_project_or_task_id?: string | null;
    fingerprint?: string;
  }) =>
    apiPost<import('@/schemas/stress').StressFlag>('/api/stress-flags', {
      action: 'raise',
      ...body
    }),

  search: (q: string) =>
    apiGet<{ tasks: Task[]; projects: Project[] }>(`/api/search?q=${encodeURIComponent(q)}`)
};
