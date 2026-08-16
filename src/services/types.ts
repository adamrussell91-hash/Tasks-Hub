import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type {
  FrameworkEntry,
  ExcursionTemplate,
  TaskTemplate,
  ProjectTemplate,
  ReviewLog
} from '@/schemas/templates';
import type { CapacityShare } from '@/schemas/capacity';
import type { CapacitySnapshot } from '@/domain/capacity';
import type { ProjectVariance } from '@/domain/closure';

export interface SeedData {
  tasks: Task[];
  projects: Project[];
  frameworks: FrameworkEntry[];
  excursion_templates: ExcursionTemplate[];
  task_templates: TaskTemplate[];
  project_templates: ProjectTemplate[];
}

export interface IndexDoc {
  ids: string[];
}

/** Shared CRUD surface used by UI and Clare (same validation, same writes). */
export interface TasksStore {
  listTasks(): Promise<Task[]>;
  getTask(id: string): Promise<Task | null>;
  createTask(input: Partial<Task> & { title: string; domain: Task['domain'] }): Promise<Task>;
  updateTask(id: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(id: string, meta?: { agent?: string; reason?: string }): Promise<void>;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;
  createProject(input: Partial<Project> & { title: string }): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<Project>;
  deleteProject(id: string, meta?: { agent?: string; reason?: string }): Promise<void>;

  listFrameworks(): Promise<FrameworkEntry[]>;
  listExcursionTemplates(): Promise<ExcursionTemplate[]>;
  listTaskTemplates(): Promise<TaskTemplate[]>;
  listProjectTemplates(): Promise<ProjectTemplate[]>;
  saveTaskAsTemplate(taskId: string, name: string): Promise<TaskTemplate>;
  saveProjectAsTemplate(projectId: string, name: string): Promise<ProjectTemplate>;
  createTaskFromTemplate(templateId: string, overrides?: Partial<Task>): Promise<Task>;

  getCapacitySnapshot(now?: Date): Promise<CapacitySnapshot>;
  ensureCapacityShare(): Promise<CapacityShare>;
  rotateCapacityShare(): Promise<CapacityShare>;
  getCapacityShare(): Promise<CapacityShare | null>;
  getPublicCapacityByToken(token: string): Promise<{
    generated_at: string;
    headlines: string[];
    overall: import('@/domain/capacity').CapacityLevel;
    days: Array<{
      date_key: string;
      weekday: string;
      level: import('@/domain/capacity').CapacityLevel;
    }>;
  } | null>;

  listReviewLogs(): Promise<ReviewLog[]>;
  getProjectVariance(projectId: string): Promise<ProjectVariance>;
  closeProject(input: {
    project_id: string;
    reason: string;
  }): Promise<{ project: Project; review: ReviewLog; variance: ProjectVariance }>;
}
