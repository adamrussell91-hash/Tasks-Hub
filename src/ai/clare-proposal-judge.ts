import { CLARE_PROPOSAL_MODEL } from '@/ai/models';
import { createAnthropicMessage } from '@/ai/anthropic';
import type { ClareDumpDigest } from '@/domain/clare-digest';
import type { DumpKind } from '@/domain/clare-dump';
import type { TaskDomain, TaskPriority } from '@/schemas/task';

export const CLARE_PROPOSAL_SYSTEM = `You are Clare DeMind on Tasks Hub. Adam brain-dumps raw chaos; you write crisp confirm-before-write task cards.

Voice: fast, warm, Australian English, competent core. No guilt lectures. Never parrot his words.

You read dump_text yourself and decide how many distinct things are actually in it. The parser's "items" array is only a rough, unreliable guess at splitting the text — it often merges several actions into one run-on line, or splits things that belong together. Ignore its boundaries. Read the raw text and work out the real list of distinct actions, communications, and notes yourself. A comma-separated run of imperatives ("sort out X, mark Y, check Z, give W") is four things, not one, however the parser chopped it.

For every distinct thing you find, return one row with:
- title: concrete next action (verb + object), <=12 words. BAD: "I really need to sort out my appraisal goal". GOOD: "Draft term 2 appraisal SMART goals". Comms: "Email parents re excursion permission", not "I need to email parents".
- kind: "task", "communication" (emails/calls/meetings), or "note" (a fact to remember, not an action — do not propose a task for a note).
- domain, priority, due_date: infer from the text and today's date. due_date is an ISO date or null.
- description: one short line of extra detail, or "".
- framework_id: pick exactly one id from the digest's frameworks list.
- reasoning: one sentence in Clare voice explaining why that framework fits (not the template alone).
- proposed_minutes: honest estimate, multiples of 5, 15-180. Use domain calibrations when present.
- existing_task_id: if this duplicates one of open_tasks (same real-world thing, not just similar wording), set it to that task's id and Clare will not create a second card. Otherwise null.
- parent_project_id: id from the digest's projects list if the text clearly belongs to one of them, else null.
- question: almost always null. Only set a question when something is genuinely ambiguous or worth a quick check-in — a real duplicate, something that reads like a note rather than work, or a "this week vs next week" style ambiguity that changes what you'd propose. Do NOT ask about a missing due date just because it is missing; most tasks do not need one and a good PA does not nag for one on every single item. Judgment, not a checklist.

Use life_context when present (energy, mood, upcoming events, active goals) to sanity-check due dates and priority — e.g. do not stack something heavy on a day already flagged as full, and let an upcoming event you can see explain an otherwise-vague deadline. Do not mention life_context content Adam did not ask about; use it only to make better calls silently.

Notes still get a row (kind: "note") so Adam can see what you parked, but never a task proposal.

Non-actionable input (return items: [] — voice only):
- Meta-commentary about the chat or a previous misread ("it was a question", "not something to create", "that wasn't a task", "you misread", "context dropped")
- Corrections and clarifications with no implied next action
- Pure questions with no work to capture
When the whole dump is non-actionable, explain in voice that you need the actual work — do NOT parrot the line as a task title.

Only respond with a JSON object, no prose outside it, no markdown fences required:
{"voice":"optional Clare reply to the whole dump","items":[{"title":"...","kind":"task","domain":"teaching","priority":"medium","due_date":null,"description":"","framework_id":"fw_timeboxing","reasoning":"...","proposed_minutes":45,"existing_task_id":null,"parent_project_id":null,"question":null}]}`;

export type ClareJudgedProposalRow = {
  title: string;
  description: string;
  kind: DumpKind;
  domain: TaskDomain;
  priority: TaskPriority;
  due_date: string | null;
  framework_id: string;
  reasoning: string;
  proposed_minutes: number;
  existing_task_id: string | null;
  parent_project_id: string | null;
  question: string | null;
};

export type ClareProposalJudgment = {
  voice: string | null;
  items: ClareJudgedProposalRow[];
  model: string | null;
  /** False when the model's reply could not be parsed at all — callers should fall back rather than trust an empty read. */
  ok: boolean;
};

export type ClareProposalJudge = (digest: ClareDumpDigest) => Promise<ClareProposalJudgment>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FRAMEWORK_IDS = new Set(['fw_eat_the_frog', 'fw_timeboxing', 'fw_eisenhower']);
const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low']);
const KINDS = new Set<DumpKind>(['task', 'communication', 'note', 'meta']);
const MAX_ITEMS = 25;

function readDueDate(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === 'null') return null;
  return ISO_DATE.test(text) ? text : null;
}

function clampMinutes(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 45;
  return Math.max(15, Math.min(180, Math.round(n / 5) * 5));
}

function cleanTitle(value: unknown): string | null {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');
  if (text.length < 3) return null;
  return text.slice(0, 96);
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanNullableId(value: unknown, validIds: Set<string>): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return validIds.has(text) ? text : null;
}

/** Pull item rows out of model text (raw JSON or fenced). */
export function parseClareProposalJudgment(text: string, digest: ClareDumpDigest): ClareProposalJudgment {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { voice: null, items: [], model: null, ok: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(start, end + 1));
  } catch {
    return { voice: null, items: [], model: null, ok: false };
  }

  const body = parsed as { voice?: unknown; items?: unknown };
  const voice =
    typeof body.voice === 'string' && body.voice.trim().length > 8
      ? body.voice.trim().slice(0, 400)
      : null;

  const rows = Array.isArray(body.items) ? body.items : [];
  const openTaskIds = new Set(digest.open_tasks.map((t) => t.id));
  const projectIds = new Set(digest.projects.map((p) => p.id));
  const items: ClareJudgedProposalRow[] = [];

  for (const row of rows) {
    if (items.length >= MAX_ITEMS) break;
    if (!row || typeof row !== 'object') continue;
    const bodyRow = row as Record<string, unknown>;

    const title = cleanTitle(bodyRow.title);
    if (!title) continue;

    const kindRaw = String(bodyRow.kind ?? 'task').trim() as DumpKind;
    const domainRaw = String(bodyRow.domain ?? digest.preferred_domain).trim();
    const priorityRaw = String(bodyRow.priority ?? 'medium').trim();
    const frameworkId = String(bodyRow.framework_id ?? 'fw_timeboxing').trim();

    items.push({
      title,
      description: cleanText(bodyRow.description, 500),
      kind: KINDS.has(kindRaw) ? kindRaw : 'task',
      domain: DOMAINS.has(domainRaw) ? (domainRaw as TaskDomain) : digest.preferred_domain,
      priority: PRIORITIES.has(priorityRaw) ? (priorityRaw as TaskPriority) : 'medium',
      due_date: readDueDate(bodyRow.due_date),
      framework_id: FRAMEWORK_IDS.has(frameworkId) ? frameworkId : 'fw_timeboxing',
      reasoning: cleanText(bodyRow.reasoning, 280),
      proposed_minutes: clampMinutes(bodyRow.proposed_minutes),
      existing_task_id: cleanNullableId(bodyRow.existing_task_id, openTaskIds),
      parent_project_id: cleanNullableId(bodyRow.parent_project_id, projectIds),
      question:
        typeof bodyRow.question === 'string' && bodyRow.question.trim()
          ? cleanText(bodyRow.question, 240)
          : null
    });
  }

  return { voice, items, model: null, ok: true };
}

export function createClareProposalJudge(options: {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): ClareProposalJudge {
  const model = options.model ?? CLARE_PROPOSAL_MODEL;
  return async (digest) => {
    const text = await createAnthropicMessage({
      apiKey: options.apiKey,
      model,
      system: CLARE_PROPOSAL_SYSTEM,
      user: JSON.stringify(digest),
      maxTokens: 1800,
      fetchImpl: options.fetchImpl
    });
    const judgment = parseClareProposalJudgment(text, digest);
    return { ...judgment, model };
  };
}

export function defaultClareProposalJudge(env: NodeJS.ProcessEnv = process.env): ClareProposalJudge | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createClareProposalJudge({
    apiKey,
    model: env.CLARE_PROPOSAL_MODEL?.trim() || undefined
  });
}
