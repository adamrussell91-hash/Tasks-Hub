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

  getCapacity: () =>
    apiGet<{
      snapshot: import('@/domain/capacity').CapacitySnapshot;
      share: import('@/schemas/capacity').CapacityShare | null;
    }>('/api/capacity'),

  ensureCapacityShare: () =>
    apiPost<{ share: import('@/schemas/capacity').CapacityShare }>('/api/capacity', {
      action: 'ensure_share'
    }),

  rotateCapacityShare: () =>
    apiPost<{ share: import('@/schemas/capacity').CapacityShare }>('/api/capacity', {
      action: 'rotate_share'
    }),

  getPublicCapacity: (token: string) =>
    apiGet<{
      generated_at: string;
      headlines: string[];
      overall: import('@/domain/capacity').CapacityLevel;
      days: Array<{
        date_key: string;
        weekday: string;
        level: import('@/domain/capacity').CapacityLevel;
      }>;
    }>(`/api/capacity?token=${encodeURIComponent(token)}`),

  listReviewLogs: () =>
    apiGet<{ reviews: import('@/schemas/templates').ReviewLog[] }>('/api/reviews').then(
      (r) => r.reviews
    ),

  getProjectVariance: (project_id: string) =>
    apiGet<{ variance: import('@/domain/closure').ProjectVariance }>(
      `/api/reviews?project_id=${encodeURIComponent(project_id)}`
    ).then((r) => r.variance),

  closeProject: (project_id: string, reason: string) =>
    apiPost<{
      project: Project;
      review: import('@/schemas/templates').ReviewLog;
      variance: import('@/domain/closure').ProjectVariance;
    }>('/api/reviews', { action: 'close', project_id, reason }),

  search: (q: string) =>
    apiGet<{ tasks: Task[]; projects: Project[] }>(`/api/search?q=${encodeURIComponent(q)}`)
};
