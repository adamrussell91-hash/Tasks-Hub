import { z } from 'zod';

export const schemaVersion = z.literal(1);

export const TaskDomainSchema = z.enum(['teaching', 'life', 'wedding', 'health', 'other']);
export const TaskKindSchema = z.enum(['task', 'step']);
export const TaskBucketSchema = z.enum(['active', 'someday']);

export const TaskStatusSchema = z.enum(['open', 'in_progress', 'done', 'deferred', 'dead']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const TaskSourceSchema = z.enum([
  'manual',
  'auto_generated_from_excursion',
  'suggested_by_agent'
]);

export const TaskSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  kind: TaskKindSchema.default('task'),
  bucket: TaskBucketSchema.default('active'),
  step_order: z.number().int().nonnegative().default(0),
  domain: TaskDomainSchema,
  framework_used: z.string().nullable().default(null),
  estimated_duration: z.number().nonnegative().nullable().default(null),
  actual_duration: z.number().nonnegative().nullable().default(null),
  due_date: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().default(null),
  status: TaskStatusSchema.default('open'),
  blocked_since: z.string().nullable().default(null),
  priority: TaskPrioritySchema.default('medium'),
  parent_project_id: z.string().nullable().default(null),
  parent_task_id: z.string().nullable().default(null),
  depends_on: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  recurrence_rule: z.string().nullable().default(null),
  due_time: z.string().nullable().default(null),
  remind_at: z.string().nullable().default(null),
  remind_dismissed_at: z.string().nullable().default(null),
  attachments: z.array(z.string()).default([]),
  source: TaskSourceSchema.default('manual')
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskDomain = z.infer<typeof TaskDomainSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskCreateSchema = TaskSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true,
  completed_at: true
}).partial({
  description: true,
  kind: true,
  bucket: true,
  step_order: true,
  framework_used: true,
  estimated_duration: true,
  actual_duration: true,
  due_date: true,
  status: true,
  blocked_since: true,
  priority: true,
  parent_project_id: true,
  parent_task_id: true,
  depends_on: true,
  tags: true,
  recurrence_rule: true,
  due_time: true,
  remind_at: true,
  remind_dismissed_at: true,
  attachments: true,
  source: true
}).extend({
  title: z.string().min(1),
  domain: TaskDomainSchema
});

export const TaskUpdateSchema = TaskCreateSchema.partial();
