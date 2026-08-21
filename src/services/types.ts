import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type {
  FrameworkEntry,
  ExcursionTemplate,
  TaskTemplate,
  ProjectTemplate,
  ReviewLog
} from '@/schemas/templates';
import type { ClareCalibration, ClareNegotiationLog } from '@/schemas/clare';
import type { ClareProposal, ClareProposalInput } from '@/domain/clare';
import type { StallOutcome } from '@/domain/stall';
import type { StressFlag } from '@/schemas/stress';
import type { CapacityShare } from '@/schemas/capacity';
import type { CapacitySnapshot, CapacityLevel } from '@/domain/capacity';
import type { ProjectVariance } from '@/domain/closure';
import type { TransitMap } from '@/schemas/map';

export interface SeedData {
  tasks: Task[];
  projects: Project[];
  frameworks: FrameworkEntry[];
  excursion_templates: ExcursionTemplate[];
  task_templates: TaskTemplate[];
  project_templates: ProjectTemplate[];
  maps?: TransitMap[];
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
  createProjectFromTemplate(
    templateId: string,
    overrides?: Partial<Project> & { event_date?: string }
  ): Promise<Project>;
  createExcursionFromTemplate(input: {
    excursion_template_id: string;
    title: string;
    event_date: string;
    student_group_reference?: string | null;
    description?: string;
  }): Promise<{ project: Project; tasks: Task[] }>;

  getClareCalibration(domain: Task['domain']): Promise<ClareCalibration>;
  listClareCalibrations(): Promise<ClareCalibration[]>;
  proposeWithClare(input: ClareProposalInput): Promise<ClareProposal>;
  acceptClareProposal(input: {
    proposal: ClareProposal;
    accepted_minutes: number;
    framework_id?: string;
  }): Promise<{ task: Task; negotiation: ClareNegotiationLog; calibration: ClareCalibration }>;
  recordClareActual(
    taskId: string,
    actualMinutes: number
  ): Promise<{ task: Task; calibration: ClareCalibration | null }>;

  listReviewLogs(): Promise<ReviewLog[]>;
  flagStalledProjects(options?: {
    weeks?: number;
    now?: Date;
  }): Promise<{ flagged: Project[]; candidates: number }>;
  resolveStalledProject(input: {
    project_id: string;
    outcome: StallOutcome;
    reason: string;
    merge_into_project_id?: string | null;
  }): Promise<{ project: Project; review: ReviewLog; moved_task_ids: string[] }>;

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

  getCapacitySnapshot(now?: Date): Promise<CapacitySnapshot>;
  ensureCapacityShare(): Promise<CapacityShare>;
  rotateCapacityShare(): Promise<CapacityShare>;
  getCapacityShare(): Promise<CapacityShare | null>;
  getPublicCapacityByToken(token: string): Promise<{
    generated_at: string;
    headlines: string[];
    overall: CapacityLevel;
    days: Array<{
      date_key: string;
      weekday: string;
      level: CapacityLevel;
    }>;
  } | null>;

  getProjectVariance(projectId: string): Promise<ProjectVariance>;
  closeProject(input: {
    project_id: string;
    reason: string;
  }): Promise<{ project: Project; review: ReviewLog; variance: ProjectVariance }>;

  listMaps(): Promise<TransitMap[]>;
  getMap(id: string): Promise<TransitMap | null>;
  createMap(input: Partial<TransitMap> & { title: string }): Promise<TransitMap>;
  updateMap(id: string, patch: Partial<TransitMap>): Promise<TransitMap>;
  deleteMap(id: string): Promise<void>;
}
