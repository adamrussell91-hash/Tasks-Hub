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
import { ClareCalibrationSchema, ClareNegotiationLogSchema } from '@/schemas/clare';
import { DEFAULT_STRESS_ROUTE, StressFlagSchema } from '@/schemas/stress';
import { CapacityShareSchema } from '@/schemas/capacity';
import { TransitMapSchema } from '@/schemas/map';
import { mindWorks2026Map } from '@/domain/maps-seed';
import { buildExcursionPlan } from '@/domain/excursion';
import { addDays, backlogTasks, toDateKey } from '@/domain/queries';
import {
  buildProposal,
  emptyCalibration,
  recordActualSample,
  recordNegotiationSample,
  type ClareProposalInput
} from '@/domain/clare';
import { DEFAULT_STALL_WEEKS, findStallCandidates, outcomeProjectStatus } from '@/domain/stall';
import { agentSlug, detectStressPatterns } from '@/domain/stress';
import { buildCapacitySnapshot, toCoreyPublicView } from '@/domain/capacity';
import { computeProjectVariance, deriveProjectEndDate } from '@/domain/closure';
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
  capacityShareKey: () => string;
  stressFlagKey: (id: string) => string;
  stressFlagsIndexKey: () => string;
  agentInboxKey: (agentSlug: string) => string;
  clareCalibrationKey: (domain: string) => string;
  clareCalibrationsIndexKey: () => string;
  clareNegotiationLogKey: (id: string) => string;
  metaSeededKey: () => string;
  mapKey: (id: string) => string;
  mapsIndexKey: () => string;
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
        source: input.source ?? 'manual',
        page_blocks: input.page_blocks ?? []
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
        drafted_documents: input.drafted_documents ?? null,
        page_blocks: input.page_blocks ?? []
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
    async createProjectFromTemplate(templateId, overrides = {}) {
      const raw = await kv.getJSON(keys.projectTemplateKey(templateId));
      if (!raw) throw new Error(`Project template not found: ${templateId}`);
      const parsed = ProjectTemplateSchema.parse(raw);
      if (parsed.type === 'excursion' && parsed.excursion_template_id) {
        const { project } = await this.createExcursionFromTemplate({
          excursion_template_id: parsed.excursion_template_id,
          title: overrides.title ?? parsed.name,
          event_date: overrides.event_date ?? toDateKey(addDays(new Date(), 45)),
          description: overrides.description
        });
        return project;
      }
      const project = await this.createProject({
        title: overrides.title ?? parsed.name,
        description: overrides.description ?? '',
        type: parsed.type,
        status: 'active'
      });
      const milestones = parsed.default_milestones.map((milestone) => ({
        id: newId('ms'),
        project_id: project.id,
        title: milestone.title ?? 'Milestone',
        due_date: milestone.due_date ?? null,
        status: (milestone.status ?? 'open') as 'open'
      }));
      return this.updateProject(project.id, { milestones });
    },
    async createExcursionFromTemplate(input) {
      const raw = await kv.getJSON(keys.excursionTemplateKey(input.excursion_template_id));
      if (!raw) throw new Error(`Excursion template not found: ${input.excursion_template_id}`);
      const template = ExcursionTemplateSchema.parse(raw);
      const plan = buildExcursionPlan(template, {
        title: input.title,
        event_date: input.event_date,
        student_group_reference: input.student_group_reference,
        description: input.description
      });

      let project = await this.createProject({
        title: input.title,
        description: input.description ?? `${template.name} excursion`,
        arc_summary: `${template.name} on ${plan.event_date}`,
        type: 'excursion',
        status: 'active',
        baseline_end_date: plan.event_date,
        current_end_date: plan.event_date,
        competition_or_event_type: template.id,
        key_dates: plan.key_dates,
        student_group_reference: input.student_group_reference ?? null,
        drafted_documents: plan.drafted_documents,
        generated_admin_tasks: [],
        milestones: []
      });

      const milestones = plan.milestones.map((m) => ({
        id: newId('ms'),
        project_id: project.id,
        title: m.title,
        due_date: m.due_date,
        status: m.status
      }));

      const tasks: Task[] = [];
      for (const planned of plan.admin_tasks) {
        const task = await this.createTask({
          title: planned.title,
          description: planned.description,
          domain: 'teaching',
          due_date: planned.due_date,
          estimated_duration: planned.estimated_duration,
          priority: planned.priority,
          parent_project_id: project.id,
          tags: planned.tags,
          source: 'auto_generated_from_excursion'
        });
        tasks.push(task);
      }

      project = await this.updateProject(project.id, {
        milestones,
        generated_admin_tasks: tasks.map((t) => t.id),
        drafted_documents: plan.drafted_documents,
        key_dates: plan.key_dates
      });

      return { project, tasks };
    },

    async getClareCalibration(domain) {
      const raw = await kv.getJSON(keys.clareCalibrationKey(domain));
      if (raw) return ClareCalibrationSchema.parse(raw);
      return emptyCalibration(domain, nowIso());
    },
    async listClareCalibrations() {
      const ids = await readIndex(kv, keys.clareCalibrationsIndexKey());
      const out = [];
      for (const id of ids) {
        const raw = await kv.getJSON(keys.clareCalibrationKey(id));
        if (raw) out.push(ClareCalibrationSchema.parse(raw));
      }
      return out;
    },
    async proposeWithClare(input: ClareProposalInput) {
      const [frameworks, tasks, calibration] = await Promise.all([
        this.listFrameworks(),
        this.listTasks(),
        this.getClareCalibration(input.domain)
      ]);
      return buildProposal(
        {
          ...input,
          backlog_titles: input.backlog_titles ?? backlogTasks(tasks).map((t) => t.title)
        },
        frameworks,
        calibration.sample_count > 0 ? calibration : null
      );
    },
    async acceptClareProposal({ proposal, accepted_minutes, framework_id }) {
      const stamp = nowIso();
      const task = await this.createTask({
        title: proposal.title,
        description: proposal.description,
        domain: proposal.domain,
        priority: proposal.priority,
        due_date: proposal.due_date,
        framework_used: framework_id ?? proposal.framework_id,
        estimated_duration: accepted_minutes,
        source: 'suggested_by_agent',
        tags: ['clare']
      });

      const negotiation = ClareNegotiationLogSchema.parse({
        schema_version: 1,
        id: newId('cnl'),
        task_id: task.id,
        domain: proposal.domain,
        framework_id: framework_id ?? proposal.framework_id,
        proposed_minutes: proposal.proposed_minutes,
        accepted_minutes,
        reasoning: proposal.reasoning,
        created_at: stamp
      });
      await kv.setJSON(keys.clareNegotiationLogKey(negotiation.id), negotiation);

      let calibration = await this.getClareCalibration(proposal.domain);
      calibration = recordNegotiationSample(
        calibration,
        proposal.proposed_minutes,
        accepted_minutes,
        stamp
      );
      await kv.setJSON(keys.clareCalibrationKey(proposal.domain), calibration);
      const calIds = await readIndex(kv, keys.clareCalibrationsIndexKey());
      if (!calIds.includes(proposal.domain)) {
        calIds.push(proposal.domain);
        await writeIndex(kv, keys.clareCalibrationsIndexKey(), calIds);
      }

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'create',
        entity_type: 'task',
        entity_id: task.id,
        reason: proposal.reasoning,
        created_at: stamp
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { task, negotiation, calibration };
    },
    async recordClareActual(taskId, actualMinutes) {
      const task = await this.updateTask(taskId, {
        actual_duration: actualMinutes,
        status: 'done'
      });
      if (!task.estimated_duration) {
        return { task, calibration: null };
      }
      const stamp = nowIso();
      let calibration = await this.getClareCalibration(task.domain);
      calibration = recordActualSample(calibration, task.estimated_duration, actualMinutes, stamp);
      await kv.setJSON(keys.clareCalibrationKey(task.domain), calibration);
      const calIds = await readIndex(kv, keys.clareCalibrationsIndexKey());
      if (!calIds.includes(task.domain)) {
        calIds.push(task.domain);
        await writeIndex(kv, keys.clareCalibrationsIndexKey(), calIds);
      }
      return { task, calibration };
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
        stall_flagged_at: input.outcome === 'revived' ? null : (existing.stall_flagged_at ?? nowIso()),
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
    },

    async listStressFlags() {
      return listByIndex(kv, keys.stressFlagsIndexKey(), keys.stressFlagKey, (raw) =>
        StressFlagSchema.parse(raw)
      );
    },

    async listAgentInbox(agent) {
      const slug = agentSlug(agent);
      const doc = await kv.getJSON<IndexDoc>(keys.agentInboxKey(slug));
      const ids = doc?.ids ?? [];
      const flags: Awaited<ReturnType<TasksStore['listStressFlags']>> = [];
      for (const id of ids) {
        const raw = await kv.getJSON(keys.stressFlagKey(id));
        if (raw) flags.push(StressFlagSchema.parse(raw));
      }
      return flags;
    },

    async raiseStressFlag(input) {
      const stamp = nowIso();
      const fingerprint =
        input.fingerprint ??
        `manual:${input.pattern_description.slice(0, 80)}:${stamp.slice(0, 10)}`;
      const existing = await this.listStressFlags();
      const dup = existing.find((f) => f.fingerprint === fingerprint);
      if (dup) return dup;

      const flag = StressFlagSchema.parse({
        schema_version: 1,
        id: newId('sf'),
        source_project_or_task_id: input.source_project_or_task_id ?? null,
        pattern_description: input.pattern_description,
        pattern_kind: input.pattern_kind ?? 'manual',
        raised_by: 'Clare DeMind',
        routed_to: DEFAULT_STRESS_ROUTE,
        recurrence_note: null,
        fingerprint,
        created_at: stamp
      });

      await kv.setJSON(keys.stressFlagKey(flag.id), flag);
      const ids = await readIndex(kv, keys.stressFlagsIndexKey());
      ids.push(flag.id);
      await writeIndex(kv, keys.stressFlagsIndexKey(), ids);

      // Write-on-create into each agent inbox (DECISIONS.md — no sync fan-out yet).
      for (const agent of flag.routed_to) {
        const slug = agentSlug(agent);
        const inboxIds = await readIndex(kv, keys.agentInboxKey(slug));
        if (!inboxIds.includes(flag.id)) {
          inboxIds.push(flag.id);
          await writeIndex(kv, keys.agentInboxKey(slug), inboxIds);
        }
      }

      const log = AgentActionLogSchema.parse({
        schema_version: 1,
        id: newId('aal'),
        agent: 'Clare DeMind',
        action: 'create',
        entity_type: 'stress_flag',
        entity_id: flag.id,
        reason: `StressFlag: ${flag.pattern_description}`,
        created_at: stamp
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return flag;
    },

    async scanAndRaiseStressFlags(options = {}) {
      const now = options.now ?? new Date();
      const [projects, tasks, existing] = await Promise.all([
        this.listProjects(),
        this.listTasks(),
        this.listStressFlags()
      ]);
      const patterns = detectStressPatterns(projects, tasks, now);
      const known = new Set(existing.map((f) => f.fingerprint));
      const raised = [];
      let skipped = 0;
      for (const pattern of patterns) {
        if (known.has(pattern.fingerprint)) {
          skipped += 1;
          continue;
        }
        const flag = await this.raiseStressFlag({
          pattern_description: pattern.pattern_description,
          pattern_kind: pattern.pattern_kind,
          source_project_or_task_id: pattern.source_project_or_task_id,
          fingerprint: pattern.fingerprint
        });
        known.add(flag.fingerprint);
        raised.push(flag);
      }
      return { raised, skipped, patterns: patterns.length };
    },

    async getCapacitySnapshot(now = new Date()) {
      const tasks = await this.listTasks();
      return buildCapacitySnapshot(tasks, now, 14);
    },

    async getCapacityShare() {
      const raw = await kv.getJSON(keys.capacityShareKey());
      return raw ? CapacityShareSchema.parse(raw) : null;
    },

    async ensureCapacityShare() {
      const existing = await this.getCapacityShare();
      if (existing?.enabled) return existing;
      const stamp = nowIso();
      const share = CapacityShareSchema.parse({
        schema_version: 1,
        id: newId('cap'),
        token: crypto.randomUUID().replace(/-/g, ''),
        enabled: true,
        created_at: stamp,
        rotated_at: null
      });
      await kv.setJSON(keys.capacityShareKey(), share);
      return share;
    },

    async rotateCapacityShare() {
      const existing = await this.getCapacityShare();
      const stamp = nowIso();
      const share = CapacityShareSchema.parse({
        schema_version: 1,
        id: existing?.id ?? newId('cap'),
        token: crypto.randomUUID().replace(/-/g, ''),
        enabled: true,
        created_at: existing?.created_at ?? stamp,
        rotated_at: stamp
      });
      await kv.setJSON(keys.capacityShareKey(), share);
      return share;
    },

    async getPublicCapacityByToken(token) {
      const share = await this.getCapacityShare();
      if (!share || !share.enabled || share.token !== token) return null;
      const snapshot = await this.getCapacitySnapshot();
      return toCoreyPublicView(snapshot);
    },

    async getProjectVariance(projectId) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error(`Project not found: ${projectId}`);
      const tasks = await this.listTasks();
      return computeProjectVariance(project, tasks);
    },

    async closeProject(input) {
      const reason = input.reason.trim();
      if (!reason) throw new Error('A short retrospective is required');
      const existing = await this.getProject(input.project_id);
      if (!existing) throw new Error(`Project not found: ${input.project_id}`);
      if (existing.status === 'archived_dead') throw new Error('Project already closed');

      const tasks = await this.listTasks();
      const derived = deriveProjectEndDate(existing, tasks);
      const variance = computeProjectVariance({ ...existing, current_end_date: derived }, tasks);

      const project = await this.updateProject(existing.id, {
        status: 'archived_dead',
        current_end_date: derived,
        review_summary: reason
      });

      const review = ReviewLogSchema.parse({
        schema_version: 1,
        id: newId('rev'),
        project_id: project.id,
        outcome: 'closed',
        reason,
        baseline_end_date: project.baseline_end_date,
        current_end_date: project.current_end_date,
        slip_days: variance.slip_days,
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
        reason: `Closed: ${reason}`,
        created_at: nowIso()
      });
      await kv.setJSON(keys.agentActionLogKey(log.id), log);

      return { project, review, variance };
    },

    async listMaps() {
      let maps = await listByIndex(kv, keys.mapsIndexKey(), keys.mapKey, (raw) =>
        TransitMapSchema.parse(raw)
      );
      if (maps.length === 0) {
        const seedMap = mindWorks2026Map();
        await kv.setJSON(keys.mapKey(seedMap.id), seedMap);
        await writeIndex(kv, keys.mapsIndexKey(), [seedMap.id]);
        maps = [seedMap];
      }
      return maps;
    },
    async getMap(id) {
      const raw = await kv.getJSON(keys.mapKey(id));
      return raw ? TransitMapSchema.parse(raw) : null;
    },
    async createMap(input) {
      const stamp = nowIso();
      const map = TransitMapSchema.parse({
        schema_version: 1,
        id: newId('map'),
        title: input.title,
        year: input.year ?? null,
        lines: input.lines ?? [],
        stations: input.stations ?? [],
        ticks: input.ticks ?? [],
        created_at: stamp,
        updated_at: stamp
      });
      await kv.setJSON(keys.mapKey(map.id), map);
      const ids = await readIndex(kv, keys.mapsIndexKey());
      ids.push(map.id);
      await writeIndex(kv, keys.mapsIndexKey(), ids);
      return map;
    },
    async updateMap(id, patch) {
      const existing = await this.getMap(id);
      if (!existing) throw new Error(`Map not found: ${id}`);
      const next = TransitMapSchema.parse({
        ...existing,
        ...patch,
        id: existing.id,
        schema_version: 1,
        created_at: existing.created_at,
        updated_at: nowIso()
      });
      await kv.setJSON(keys.mapKey(id), next);
      return next;
    },
    async deleteMap(id) {
      await kv.delete(keys.mapKey(id));
      const ids = (await readIndex(kv, keys.mapsIndexKey())).filter((x) => x !== id);
      await writeIndex(kv, keys.mapsIndexKey(), ids);
    }
  };
}

export type { TaskDomain };

/** Seed once into an empty store (idempotent via meta/seeded). Pass force to rewrite. */
export async function seedIfEmpty(
  kv: KvAdapter,
  keys: KeyBuilders,
  seed: SeedData,
  options: { force?: boolean } = {}
): Promise<void> {
  const marker = await kv.getJSON<{ at: string }>(keys.metaSeededKey());
  if (marker && !options.force) return;

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

  const maps = seed.maps?.length ? seed.maps : [mindWorks2026Map()];
  for (const item of maps) {
    await kv.setJSON(keys.mapKey(item.id), TransitMapSchema.parse(item));
  }
  await writeIndex(
    kv,
    keys.mapsIndexKey(),
    maps.map((m) => m.id)
  );

  await kv.setJSON(keys.metaSeededKey(), { at: nowIso() });
}
