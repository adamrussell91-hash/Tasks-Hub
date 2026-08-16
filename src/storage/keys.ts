export function taskKey(id: string): string {
  return `tasks/${id}`;
}

export function tasksIndexKey(): string {
  return 'tasks/_index';
}

export function projectKey(id: string): string {
  return `projects/${id}`;
}

export function projectsIndexKey(): string {
  return 'projects/_index';
}

export function frameworkKey(id: string): string {
  return `frameworks/${id}`;
}

export function frameworksIndexKey(): string {
  return 'frameworks/_index';
}

export function excursionTemplateKey(id: string): string {
  return `excursion_templates/${id}`;
}

export function excursionTemplatesIndexKey(): string {
  return 'excursion_templates/_index';
}

export function taskTemplateKey(id: string): string {
  return `task_templates/${id}`;
}

export function taskTemplatesIndexKey(): string {
  return 'task_templates/_index';
}

export function projectTemplateKey(id: string): string {
  return `project_templates/${id}`;
}

export function projectTemplatesIndexKey(): string {
  return 'project_templates/_index';
}

export function reviewLogKey(id: string): string {
  return `review_logs/${id}`;
}

export function reviewLogsIndexKey(): string {
  return 'review_logs/_index';
}

export function agentActionLogKey(id: string): string {
  return `agent_actions/${id}`;
}

export function metaSeededKey(): string {
  return 'meta/seeded';
}
