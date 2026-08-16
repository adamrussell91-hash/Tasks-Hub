import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type {
  FrameworkEntry,
  ExcursionTemplate,
  TaskTemplate,
  ProjectTemplate
} from '@/schemas/templates';
import type { StressFlag } from '@/schemas/stress';

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

  listStressFlags(): Promise<StressFlag[]>;
  listAgentInbox(agent: string): Promise<StressFlag[]>;
  raiseStressFlag(input: {
    pattern_description: string;
    pattern_kind?: StressFlag['pattern_kind'];
    source_project_or_task_id?: string | null;
    fingerprint?: string;
  }): Promise<StressFlag>;
  scanAndRaiseStressFlags(options?: { now?: Date }): Promise<{
    raised: StressFlag[];
    skipped: number;
    patterns: number;
  }>;
}
