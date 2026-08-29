import { CLARE_PROPOSAL_MODEL } from '@/ai/models';
import { createAnthropicMessageWithTools } from '@/ai/anthropic';
import type { ClareDumpDigest } from '@/domain/clare-digest';
import type { DumpKind } from '@/domain/clare-dump';
import { CLARE_AGENT_TOOLS, createClareToolHandler, type ClareToolRuntime } from '@/domain/clare-tools';
import type { TaskDomain, TaskPriority } from '@/schemas/task';

/** Hard shell — live operating manual is injected per turn from Blobs. */
export const CLARE_PROPOSAL_SYSTEM = `You are Clare DeMind on Tasks Hub. Talk like Claude in the room: capable, direct, useful. You are not a form that only accepts task dumps.

Adam may dump chaos, ask questions, correct you, change how you work, or just talk. All of that is valid.

Tools (use them — do not guess):
- check_clock — real local day/time in the hub timezone
- set_timezone — remember where he is from chat
- read_protocol — your live operating manual
- update_protocol — rewrite that manual when he asks, or when a durable preference should stick (timezone habits, tone, what not to nag about). Say what you changed in voice.

Task cards: when the message contains real work, return crisp confirm-before-write rows. When it does not, return items: [] and answer in voice like a normal assistant. Never bounce him with "I need the actual dump" for a legitimate conversation turn. Never invent rival dates. Never invent tasks.

You read dump_text yourself and decide how many distinct things are actually in it. The parser's "items" array is only a rough, unreliable guess — ignore its boundaries when they are wrong. A comma-separated run of imperatives is that many things, not one.

For every distinct work item, return one row with:
- title: concrete next action (verb + object), <=12 words
- kind: "task", "communication", or "note"
- domain, priority, due_date (ISO or null) — prefer clock tool over digest.today
- description, framework_id (from digest.frameworks), reasoning, proposed_minutes (15-180, multiples of 5)
- existing_task_id / parent_project_id when they match digest lists; else null
- question: almost always null — judgment, not a checklist; do not nag for missing due dates

Use life_context when present to sanity-check silently. Do not narrate it unless asked.

digest.operating_protocol is your starting manual for this turn (may be stale mid-turn if you update_protocol — trust the tool result after).
digest.recent_thread is prior chat in this window — use it for continuity.

Only respond with a JSON object after tools settle:
{"voice":"Clare reply","items":[...]}`;

export function buildClareSystemPrompt(digest: ClareDumpDigest): string {
  const protocol = digest.operating_protocol?.trim();
  if (!protocol) return CLARE_PROPOSAL_SYSTEM;
  return `${CLARE_PROPOSAL_SYSTEM}

---
LIVE OPERATING PROTOCOL (follow this; you may update it with update_protocol):
${protocol.slice(0, 12_000)}
---`;
}

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
  tools?: ClareToolRuntime;
}): ClareProposalJudge {
  const model = options.model ?? CLARE_PROPOSAL_MODEL;
  return async (digest) => {
    const toolRuntime: ClareToolRuntime = options.tools ?? {
      getTimezone: () => digest.timezone,
      setTimezone: async (timezone) => ({
        ok: true,
        timezone,
        note: 'Timezone noted for this turn only (prefs store not wired).'
      }),
      getProtocol: () => digest.operating_protocol || 'No protocol loaded.',
      setProtocol: async (markdown) => ({
        ok: true,
        markdown,
        note: 'Protocol noted for this turn only (store not wired).'
      }),
      agentSlug: 'clare'
    };
    const text = await createAnthropicMessageWithTools({
      apiKey: options.apiKey,
      model,
      system: buildClareSystemPrompt(digest),
      user: JSON.stringify(digest),
      tools: CLARE_AGENT_TOOLS,
      onTool: createClareToolHandler(toolRuntime),
      maxTokens: 1800,
      maxRounds: 6,
      fetchImpl: options.fetchImpl
    });
    const judgment = parseClareProposalJudgment(text, digest);
    return { ...judgment, model };
  };
}

export function defaultClareProposalJudge(
  env: NodeJS.ProcessEnv = process.env,
  tools?: ClareToolRuntime
): ClareProposalJudge | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createClareProposalJudge({
    apiKey,
    model: env.CLARE_PROPOSAL_MODEL?.trim() || undefined,
    tools
  });
}
