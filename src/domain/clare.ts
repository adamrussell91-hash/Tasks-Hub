import type { FrameworkEntry } from '@/schemas/templates';
import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { ClareCalibration } from '@/schemas/clare';

export type ClareProposalInput = {
  title: string;
  domain: TaskDomain;
  description?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  /** Open backlog titles used to detect “sitting untouched” patterns. */
  backlog_titles?: string[];
};

export type ClareFrameworkPick = {
  framework: FrameworkEntry;
  reasoning: string;
};

export type ClareProposal = {
  title: string;
  domain: TaskDomain;
  description: string;
  priority: TaskPriority;
  due_date: string | null;
  framework_id: string;
  framework_name: string;
  reasoning: string;
  proposed_minutes: number;
  /** Starting point for Adam’s counter — same as proposed until he edits. */
  suggested_accepted_minutes: number;
  calibration_note: string | null;
};

const BASE_BY_DOMAIN: Record<TaskDomain, number> = {
  teaching: 60,
  life: 30,
  wedding: 45,
  health: 30,
  other: 40
};

const MAX_DELTAS = 20;

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function includesAny(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

/** Pick a framework and fill its reasoning template with task texture. */
export function selectFramework(
  input: ClareProposalInput,
  frameworks: FrameworkEntry[]
): ClareFrameworkPick {
  const byId = new Map(frameworks.map((f) => [f.id, f]));
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  const backlogHit =
    input.backlog_titles?.some((t) => t.toLowerCase() === input.title.trim().toLowerCase()) ??
    false;

  let id = 'fw_timeboxing';
  let reasoningExtra = '';

  if (
    backlogHit ||
    includesAny(text, ['overdue', 'sitting', 'still not', 'keep putting', 'procrast', 'frog'])
  ) {
    id = 'fw_eat_the_frog';
    reasoningExtra = backlogHit
      ? ' It is already on the backlog without a due date.'
      : '';
  } else if (
    includesAny(text, ['decide', 'priority', 'urgent vs', 'important', 'triage', 'which first'])
  ) {
    id = 'fw_eisenhower';
  } else if (
    includesAny(text, ['marking', 'write', 'draft', 'research', 'plan', 'open-ended', 'essay'])
  ) {
    id = 'fw_timeboxing';
  } else if (input.priority === 'urgent' || input.priority === 'high') {
    id = 'fw_eat_the_frog';
  } else if (input.domain === 'wedding' || input.domain === 'life') {
    id = 'fw_eisenhower';
  }

  const framework = byId.get(id) ?? frameworks[0];
  if (!framework) {
    throw new Error('Framework library is empty');
  }

  const reasoning = framework.reasoning_template + reasoningExtra;
  return { framework, reasoning };
}

export function baseEstimateMinutes(input: ClareProposalInput): number {
  let minutes = BASE_BY_DOMAIN[input.domain];
  const text = `${input.title} ${input.description ?? ''}`.toLowerCase();
  if (includesAny(text, ['marking', 'batch'])) minutes += 30;
  if (includesAny(text, ['lesson', 'pack', 'unit'])) minutes += 25;
  if (includesAny(text, ['email', 'reply', 'quick'])) minutes = Math.max(15, minutes - 25);
  if (includesAny(text, ['meeting', 'call'])) minutes = 30;
  if (input.priority === 'urgent') minutes = Math.round(minutes * 0.85);
  return Math.max(15, Math.round(minutes / 5) * 5);
}

export function applyCalibration(
  baseMinutes: number,
  calibration: ClareCalibration | null
): { minutes: number; note: string | null } {
  if (!calibration || calibration.sample_count < 2) {
    return {
      minutes: baseMinutes,
      note: calibration
        ? 'Still learning your overrides — need a couple more negotiations.'
        : null
    };
  }
  const bias = avg(calibration.recent_deltas);
  const calibrated = Math.max(
    15,
    Math.round((calibration.calibrated_default_minutes + baseMinutes + bias) / 2 / 5) * 5
  );
  const note =
    bias > 5
      ? `You usually add about ${Math.round(bias)} minutes to my guesses in ${calibration.domain}.`
      : bias < -5
        ? `You usually trim about ${Math.round(Math.abs(bias))} minutes off my guesses in ${calibration.domain}.`
        : `My ${calibration.domain} guesses have been close lately.`;
  return { minutes: calibrated, note };
}

export function buildProposal(
  input: ClareProposalInput,
  frameworks: FrameworkEntry[],
  calibration: ClareCalibration | null
): ClareProposal {
  const { framework, reasoning } = selectFramework(input, frameworks);
  const base = baseEstimateMinutes(input);
  const { minutes, note } = applyCalibration(base, calibration);
  return {
    title: input.title.trim(),
    domain: input.domain,
    description: input.description?.trim() ?? '',
    priority: input.priority ?? 'medium',
    due_date: input.due_date ?? null,
    framework_id: framework.id,
    framework_name: framework.name,
    reasoning,
    proposed_minutes: minutes,
    suggested_accepted_minutes: minutes,
    calibration_note: note
  };
}

export function emptyCalibration(domain: TaskDomain, nowIso: string): ClareCalibration {
  return {
    schema_version: 1,
    id: `clare_cal_${domain}`,
    domain,
    sample_count: 0,
    sum_proposed: 0,
    sum_accepted: 0,
    actual_sample_count: 0,
    sum_actual: 0,
    recent_deltas: [],
    calibrated_default_minutes: BASE_BY_DOMAIN[domain],
    updated_at: nowIso
  };
}

/** Fold an accepted negotiation into calibration (override learning). */
export function recordNegotiationSample(
  calibration: ClareCalibration,
  proposed: number,
  accepted: number,
  nowIso: string
): ClareCalibration {
  const delta = accepted - proposed;
  const recent = [...calibration.recent_deltas, delta].slice(-MAX_DELTAS);
  const sample_count = calibration.sample_count + 1;
  const sum_proposed = calibration.sum_proposed + proposed;
  const sum_accepted = calibration.sum_accepted + accepted;
  const meanAccepted = sum_accepted / sample_count;
  const bias = avg(recent);
  const calibrated_default_minutes = Math.max(
    15,
    Math.round((meanAccepted + bias) / 5) * 5
  );
  return {
    ...calibration,
    sample_count,
    sum_proposed,
    sum_accepted,
    recent_deltas: recent,
    calibrated_default_minutes,
    updated_at: nowIso
  };
}

/** Fold actual_duration vs estimate once a task is done. */
export function recordActualSample(
  calibration: ClareCalibration,
  estimated: number,
  actual: number,
  nowIso: string
): ClareCalibration {
  const actual_sample_count = calibration.actual_sample_count + 1;
  const sum_actual = calibration.sum_actual + actual;
  const meanActual = sum_actual / actual_sample_count;
  const drift = actual - estimated;
  const recent = [...calibration.recent_deltas, drift].slice(-MAX_DELTAS);
  return {
    ...calibration,
    actual_sample_count,
    sum_actual,
    recent_deltas: recent,
    calibrated_default_minutes: Math.max(15, Math.round((meanActual + avg(recent)) / 5) * 5),
    updated_at: nowIso
  };
}

export function frameworkLabel(task: Task, frameworks: FrameworkEntry[]): string | null {
  if (!task.framework_used) return null;
  return frameworks.find((f) => f.id === task.framework_used)?.name ?? task.framework_used;
}
