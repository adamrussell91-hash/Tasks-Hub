import { TaskSchema, type Task, type TaskDomain } from '@/schemas/task';
import { ProjectSchema } from '@/schemas/project';
import {
  FrameworkEntrySchema,
  ExcursionTemplateSchema,
  TaskTemplateSchema,
  ProjectTemplateSchema,
  AgentActionLogSchema,
  ReviewLogSchema
} from '@/schemas/templates';
import {
  DEFAULT_STALL_WEEKS,
  findStallCandidates,
  outcomeProjectStatus
} from '@/domain/stall';
import type { IndexDoc, SeedData, TasksStore } from './types';

export interface KvAdapter {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface KeyBuilders {
  taskKey: (id: string) => string;
  tasksIndexKey: () => string;
  projectKey: (id: string) => string;
  projectsIndexKey: () => string;
  frameworkKey: (id: string) => string;
  frameworksIndexKey: () => string;
  excursionTemplateKey: (id: string) => string;
  excursionTemplatesIndexKey: () => string;
  taskTemplateKey: (id: string) => string;
  taskTemplatesIndexKey: () => string;
  projectTemplateKey: (id: string) => string;
  projectTemplatesIndexKey: () => string;
  agentActionLogKey: (id: string) => string;
  reviewLogKey: (id: string) => string;
  reviewLogsIndexKey: () => string;
  metaSeededKey: () => string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

async function readIndex(kv: KvAdapter, key: string): Promise<string[]> {
  const doc = await kv.getJSON<IndexDoc>(key);
  return doc?.ids ?? [];
}

async function writeIndex(kv: KvAdapter, key: string, ids: string[]): Promise<void> {
  await kv.setJSON(key, { ids } satisfies IndexDoc);
}

async function listByIndex<T>(
  kv: KvAdapter,
  indexKey: string,
  itemKey: (id: string) => string,
  parse: (raw: unknown) => T
): Promise<T[]> {
  const ids = await readIndex(kv, indexKey);
  const items: T[] = [];
  for (const id of ids) {
    const raw = await kv.getJSON(itemKey(id));
    if (raw) items.push(parse(raw));
  }
  return items;
}

export function createTasksStore(kv: KvAdapter, keys: KeyBuilders): TasksStore {
  return {
    async listTasks() {
      return listByIndex(kv, keys.tasksIndexKey(), keys.taskKey, (raw) => TaskSchema.parse(raw));
    },
    async getTask(id) {
      const raw = await kv.getJSON(keys.taskKey(id));
      return raw ? TaskSchema.parse(raw) : null;
    },
    async createTask(input) {
      const stamp = nowIso();
      const task = TaskSchema.parse({
        schema_version: 1,
        id: newId('task'),
        title: input.title,
        description: input.description ?? '',
        domain: input.domain,
        framework_used: input.framework_used ?? null,
        estimated_duration: input.estimated_duration ?? null,
        actual_duration: input.actual_duration ?? null,
        due_date: input.due_date ?? null,
        created_at: stamp,
        updated_at: stamp,
        completed_at: null,
        status: input.status ?? 'open',
        priority: input.priority ?? 'medium',
        parent_project_id: input.parent_project_id ?? null,
        parent_task_id: input.parent_task_id ?? null,
        depends_on: input.depends_on ?? [],
        tags: input.tags ?? [],
        recurrence_rule: input.recurrence_rule ?? null,
        attachments: input.attachments ?? [],
        source: input.source ?? 'manual'
      });
      await kv.setJSON(keys.taskKey(task.id), task);
      const ids = await readIndex(kv, keys.tasksIndexKey());
      ids.push(task.id);
      await writeIndex(kv, keys.tasksIndexKey(), ids);
      return task;
    },
    async updateTask(id, patch) {
      const existing = await this.getTask(id);
      if (!existing) throw new Error(`Task not found: ${id}`);
      const next = TaskSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso(),
        completed_at:
          patch.status === 'done' && !existing.completed_at
            ? nowIso()
            : patch.status && patch.status !== 'done'
              ? null
              : (patch.completed_at ?? existing.completed_at)
      });
      await kv.setJSON(keys.taskKey(id), next);
      return next;
    },
    async deleteTask(id, meta) {
      const existing = await this.getTask(id);
      if (!existing) return;
      await kv.delete(keys.taskKey(id));
      const ids = (await readIndex(kv, keys.tasksIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.tasksIndexKey(), ids);
      if (meta?.agent) {
        const log = AgentActionLogSchema.parse({
          schema_version: 1,
          id: newId('aal'),
          agent: meta.agent,
          action: 'delete',
          entity_type: 'task',
          entity_id: id,
          reason: meta.reason ?? '',
          created_at: nowIso()
        });
        await kv.setJSON(keys.agentActionLogKey(log.id), log);
      }
    },

    async listProjects() {
      return listByIndex(kv, keys.projectsIndexKey(), keys.projectKey, (raw) =>
        ProjectSchema.parse(raw)
      );
    },
    async getProject(id) {
      const raw = await kv.getJSON(keys.projectKey(id));
      return raw ? ProjectSchema.parse(raw) : null;
    },
    async createProject(input) {
      const stamp = nowIso();
      const project = ProjectSchema.parse({
        schema_version: 1,
        id: newId('proj'),
        title: input.title,
        description: input.description ?? '',
        arc_summary: input.arc_summary ?? '',
        type: input.type ?? 'standard',
        milestones: input.milestones ?? [],
        status: input.status ?? 'active',
        baseline_end_date: input.baseline_end_date ?? input.current_end_date ?? null,
        current_end_date: input.current_end_date ?? input.baseline_end_date ?? null,
        review_summary: null,
        stall_flagged_at: null,
        created_at: stamp,
        updated_at: stamp,
        competition_or_event_type: input.competition_or_event_type ?? null,
        key_dates: input.key_dates ?? null,
        student_group_reference: input.student_group_reference ?? null,
        generated_admin_tasks: input.generated_admin_tasks ?? [],
        drafted_documents: input.drafted_documents ?? null
      });
      await kv.setJSON(keys.projectKey(project.id), project);
      const ids = await readIndex(kv, keys.projectsIndexKey());
      ids.push(project.id);
      await writeIndex(kv, keys.projectsIndexKey(), ids);
      return project;
    },
    async updateProject(id, patch) {
      const existing = await this.getProject(id);
      if (!existing) throw new Error(`Project not found: ${id}`);
      const next = ProjectSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso(),
        baseline_end_date: existing.baseline_end_date
      });
      await kv.setJSON(keys.projectKey(id), next);
      return next;
    },
    async deleteProject(id, meta) {
      const existing = await this.getProject(id);
      if (!existing) return;
      await kv.delete(keys.projectKey(id));
      const ids = (await readIndex(kv, keys.projectsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.projectsIndexKey(), ids);
      if (meta?.agent) {
        const log = AgentActionLogSchema.parse({
          schema_version: 1,
          id: newId('aal'),
          agent: meta.agent,
          action: 'delete',
          entity_type: 'project',
          entity_id: id,
          reason: meta.reason ?? '',
          created_at: nowIso()
        });
        await kv.setJSON(keys.agentActionLogKey(log.id), log);
      }
    },

    async listFrameworks() {
      return listByIndex(kv, keys.frameworksIndexKey(), keys.frameworkKey, (raw) =>
        FrameworkEntrySchema.parse(raw)
      );
    },
    async listExcursionTemplates() {
      return listByIndex(
        kv,
        keys.excursionTemplatesIndexKey(),
        keys.excursionTemplateKey,
        (raw) => ExcursionTemplateSchema.parse(raw)
      );
    },
    async listTaskTemplates() {
      return listByIndex(kv, keys.taskTemplatesIndexKey(), keys.taskTemplateKey, (raw) =>
        TaskTemplateSchema.parse(raw)
      );
    },
    async listProjectTemplates() {
      return listByIndex(kv, keys.projectTemplatesIndexKey(), keys.projectTemplateKey, (raw) =>
        ProjectTemplateSchema.parse(raw)
      );
    },
    async saveTaskAsTemplate(taskId, name) {
      const task = await this.getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      const template = TaskTemplateSchema.parse({
        schema_version: 1,
        id: newId('tt'),
        name,
        domain: task.domain,
        default_fields: {
          title_pattern: task.title,
          framework_used: task.framework_used,
          estimated_duration: task.estimated_duration,
          priority: task.priority,
          tags: task.tags
        },
        created_from: task.id,
        created_at: nowIso()
      });
      await kv.setJSON(keys.taskTemplateKey(template.id), template);
      const ids = await readIndex(kv, keys.taskTemplatesIndexKey());
      ids.push(template.id);
      await writeIndex(kv, keys.taskTemplatesIndexKey(), ids);
      return template;
    },
    async saveProjectAsTemplate(projectId, name) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const template = ProjectTemplateSchema.parse({
        schema_version: 1,
        id: newId('pt'),
        name,
        type: project.type,
        excursion_template_id: project.competition_or_event_type,
        default_milestones: project.milestones.map((m) => ({
          title: m.title,
          due_date: null,
          status: 'open' as const
        })),
        created_from: project.id,
        created_at: nowIso()
      });
      await kv.setJSON(keys.projectTemplateKey(template.id), template);
      const ids = await readIndex(kv, keys.projectTemplatesIndexKey());
      ids.push(template.id);
      await writeIndex(kv, keys.projectTemplatesIndexKey(), ids);
      return template;
    },
    async createTaskFromTemplate(templateId, overrides = {}) {
      const template = await kv.getJSON(keys.taskTemplateKey(templateId));
      if (!template) throw new Error(`Task template not found: ${templateId}`);
      const parsed = TaskTemplateSchema.parse(template);
      return this.createTask({
        title: overrides.title ?? parsed.default_fields.title_pattern ?? parsed.name,
        domain: (overrides.domain as TaskDomain) ?? parsed.domain,
        framework_used: overrides.framework_used ?? parsed.default_fields.framework_used ?? null,
        estimated_duration:
          overrides.estimated_duration ?? parsed.default_fields.estimated_duration ?? null,
        priority: (overrides.priority as Task['priority']) ??
          (parsed.default_fields.priority as Task['priority']) ??
          'medium',
        tags: overrides.tags ?? parsed.default_fields.tags ?? [],
        ...overrides
      });
    },

    async listReviewLogs() {
      return listByIndex(kv, keys.reviewLogsIndexKey(), keys.reviewLogKey, (raw) =>
        ReviewLogSchema.parse(raw)
      );
    },

    async flagStalledProjects(options = {}) {
      const weeks = options.weeks ?? DEFAULT_STALL_WEEKS;
      const now = options.now ?? new Date();
      const stamp = nowIso();
      const [projects, tasks] = await Promise.all([this.listProjects(), this.listTasks()]);
      const candidates = findStallCandidates(projects, tasks, now, weeks);
      const flagged: Awaited<ReturnType<TasksStore['listProjects']>> = [];

      for (const candidate of candidates) {
        if (candidate.project.status === 'stalled') {
          flagged.push(candidate.project);
          continue;
        }
        if (candidate.project.status === 'archived_dead') continue;
        const updated = await this.updateProject(candidate.project.id, {
          status: 'stalled',
          stall_flagged_at: stamp
        });
        flagged.push(updated);
      }

      return { flagged, candidates: candidates.length };
    },

    async resolveStalledProject(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error('A short reason is required');

      const existing = await this.getProject(input.project_id);
      if (!existing) throw new Error(`Project not found: ${input.project_id}`);

      const moved_task_ids: string[] = [];
      if (input.outcome === 'frankensteined') {
        const targetId = input.merge_into_project_id;
        if (!targetId) throw new Error('Frankenstein needs a merge target project');
        if (targetId === input.project_id) throw new Error('Cannot merge a project into itself');
        const target = await this.getProject(targetId);
        if (!target || target.status === 'archived_dead') {
          throw new Error('Merge target project not found or archived');
        }
        const tasks = await this.listTasks();
        for (const task of tasks) {
          if (task.parent_project_id !== existing.id) continue;
          await this.updateTask(task.id, { parent_project_id: targetId });
          moved_task_ids.push(task.id);
        }
      }

      const status = outcomeProjectStatus(input.outcome);
      const project = await this.updateProject(existing.id, {
        status,
        stall_flagged_at: input.outcome === 'revived' ? null : existing.stall_flagged_at ?? nowIso(),
        review_summary: reason
      });

      const review = ReviewLogSchema.parse({
        schema_version: 1,
        id: newId('rev'),
        project_id: project.id,
        outcome: input.outcome,
        reason,
        merge_into_project_id:
          input.outcome === 'frankensteined' ? (input.merge_into_project_id ?? null) : null,
        created_at: nowIso()
      });
      await kv.setJSON(keys.reviewLogKey(review.id), review);
      const ids = await readIndex(kv, keys.reviewLogsIndexKey());
      ids.push(review.id);
      await writeIndex(kv, keys.reviewLogsIndexKey(), ids);

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'update',
        entity_type: 'project',
        entity_id: project.id,
        reason: `${input.outcome}: ${reason}`,
        created_at: nowIso()
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { project, review, moved_task_ids };
    }
  };
}

export type { TaskDomain };

/** Seed once into an empty store (idempotent via meta/seeded). */
export async function seedIfEmpty(kv: KvAdapter, keys: KeyBuilders, seed: SeedData): Promise<void> {
  const marker = await kv.getJSON<{ at: string }>(keys.metaSeededKey());
  if (marker) return;

  for (const item of seed.frameworks) {
    await kv.setJSON(keys.frameworkKey(item.id), FrameworkEntrySchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.frameworksIndexKey(),
    seed.frameworks.map((f) => f.id)
  );

  for (const item of seed.excursion_templates) {
    await kv.setJSON(keys.excursionTemplateKey(item.id), ExcursionTemplateSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.excursionTemplatesIndexKey(),
    seed.excursion_templates.map((t) => t.id)
  );

  for (const item of seed.task_templates) {
    await kv.setJSON(keys.taskTemplateKey(item.id), TaskTemplateSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.taskTemplatesIndexKey(),
    seed.task_templates.map((t) => t.id)
  );

  for (const item of seed.project_templates) {
    await kv.setJSON(keys.projectTemplateKey(item.id), ProjectTemplateSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.projectTemplatesIndexKey(),
    seed.project_templates.map((t) => t.id)
  );

  for (const item of seed.projects) {
    await kv.setJSON(keys.projectKey(item.id), ProjectSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.projectsIndexKey(),
    seed.projects.map((p) => p.id)
  );

  for (const item of seed.tasks) {
    await kv.setJSON(keys.taskKey(item.id), TaskSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.tasksIndexKey(),
    seed.tasks.map((t) => t.id)
  );

  await kv.setJSON(keys.metaSeededKey(), { at: nowIso() });
}
