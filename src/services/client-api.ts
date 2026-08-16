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

  createExcursionFromTemplate: (input: {
    excursion_template_id: string;
    title: string;
    event_date: string;
    student_group_reference?: string | null;
    description?: string;
  }) =>
    apiPost<{ project: Project; tasks: Task[] }>('/api/templates', {
      action: 'create_excursion_from_template',
      ...input
    }),

  search: (q: string) =>
    apiGet<{ tasks: Task[]; projects: Project[] }>(`/api/search?q=${encodeURIComponent(q)}`)
};
