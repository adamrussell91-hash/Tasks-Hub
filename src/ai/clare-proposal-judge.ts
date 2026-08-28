import { CLARE_PROPOSAL_MODEL } from '@/ai/models';
import { createAnthropicMessage } from '@/ai/anthropic';
import type { ClareDumpDigest } from '@/domain/clare-digest';
import type { TaskDomain, TaskPriority } from '@/schemas/task';

export const CLARE_PROPOSAL_SYSTEM = `You are Clare DeMind on Tasks Hub. Adam brain-dumps raw chaos; you write crisp confirm-before-write task cards.

Voice: fast, warm, Australian English, competent core. No guilt lectures. Never parrot his words.

Titles:
- Concrete next actions (verb + object), ≤12 words.
- BAD: "I really need to sort out my appraisal goal"
- GOOD: "Draft term 2 appraisal SMART goals"
- Comms: "Email parents re excursion permission", not "I need to email parents"

Frameworks: pick exactly one framework_id from the digest list. reasoning: one sentence in Clare voice explaining why that framework fits this task (not the template alone).

Minutes: honest estimate, multiples of 5, 15–180. Use domain calibrations when present — if Adam usually adds time in teaching, budget it.

Due dates: respect parser due_date when set. Otherwise infer from raw text or leave null.

Only write proposals for items where propose=true AND the raw text is concrete work Adam wants captured.

Non-actionable input (return proposals: [] — voice only):
- Meta-commentary about the chat or a previous misread ("it was a question", "not something to create", "that wasn't a task", "you misread", "context dropped")
- Corrections and clarifications with no implied next action
- Pure questions with no work to capture
When the whole dump is non-actionable, explain in voice that you need the actual work — do NOT parrot the line as a task title.

Return JSON only:
{"voice":"optional Clare reply to the whole dump","proposals":[{"item_index":0,"title":"...","description":"","domain":"teaching","priority":"medium","due_date":null,"framework_id":"fw_timeboxing","reasoning":"...","proposed_minutes":45}]}`;

export type ClareJudgedProposalRow = {
  item_index: number;
  title: string;
  description: string;
  domain: TaskDomain;
  priority: TaskPriority;
  due_date: string | null;
  framework_id: string;
  reasoning: string;
  proposed_minutes: number;
};

export type ClareProposalJudgment = {
  voice: string | null;
  proposals: ClareJudgedProposalRow[];
  model: string | null;
};

export type ClareProposalJudge = (digest: ClareDumpDigest) => Promise<ClareProposalJudgment>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const FRAMEWORK_IDS = new Set(['fw_eat_the_frog', 'fw_timeboxing', 'fw_eisenhower']);
const DOMAINS = new Set(['teaching', 'life', 'wedding', 'health', 'other']);
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low']);

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

function cleanTitle(value: unknown, fallback: string): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');
  if (text.length < 3) return fallback;
  return text.slice(0, 96);
}

/** Pull proposal rows out of model text (raw JSON or fenced). */
export function parseClareProposalJudgment(text: string, digest: ClareDumpDigest): ClareProposalJudgment {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const payload = fenced?.[1]?.trim() ?? trimmed;
  const start = payload.indexOf('{');
  const end = payload.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { voice: null, proposals: [], model: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.slice(start, end + 1));
  } catch {
    return { voice: null, proposals: [], model: null };
  }

  const body = parsed as { voice?: unknown; proposals?: unknown };
  const voice =
    typeof body.voice === 'string' && body.voice.trim().length > 8
      ? body.voice.trim().slice(0, 400)
      : null;

  const rows = Array.isArray(body.proposals) ? body.proposals : [];
  const proposeable = new Map(
    digest.items.filter((item) => item.propose).map((item) => [item.index, item])
  );
  const seen = new Set<number>();
  const proposals: ClareJudgedProposalRow[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const bodyRow = row as Record<string, unknown>;
    const itemIndex = Number(bodyRow.item_index);
    if (!Number.isInteger(itemIndex) || seen.has(itemIndex)) continue;
    const digestItem = proposeable.get(itemIndex);
    if (!digestItem) continue;
    seen.add(itemIndex);

    const domainRaw = String(bodyRow.domain ?? digestItem.domain).trim();
    const priorityRaw = String(bodyRow.priority ?? digestItem.priority).trim();
    const frameworkId = String(bodyRow.framework_id ?? 'fw_timeboxing').trim();

    proposals.push({
      item_index: itemIndex,
      title: cleanTitle(bodyRow.title, digestItem.parser_title),
      description: String(bodyRow.description ?? '').trim().slice(0, 500),
      domain: DOMAINS.has(domainRaw) ? (domainRaw as TaskDomain) : digestItem.domain,
      priority: PRIORITIES.has(priorityRaw)
        ? (priorityRaw as TaskPriority)
        : digestItem.priority,
      due_date: readDueDate(bodyRow.due_date) ?? digestItem.due_date,
      framework_id: FRAMEWORK_IDS.has(frameworkId) ? frameworkId : 'fw_timeboxing',
      reasoning: String(bodyRow.reasoning ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 280),
      proposed_minutes: clampMinutes(bodyRow.proposed_minutes)
    });
    if (proposals.length >= digest.items.filter((i) => i.propose).length) break;
  }

  return { voice, proposals, model: null };
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
      maxTokens: 1400,
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
