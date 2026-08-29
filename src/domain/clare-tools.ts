import type { AnthropicTool } from '@/ai/anthropic';
import {
  applyProtocolUpdate,
  type AgentProtocolSlug,
  type ProtocolUpdateMode
} from '@/domain/agent-protocol';
import { resolveTimeZoneInput } from '@/domain/hub-prefs';
import { HUB_TZ, hubWeekdayLong, toHubDateKey } from '@/domain/queries';

export const CLARE_CHECK_CLOCK_TOOL = 'check_clock';
export const CLARE_SET_TIMEZONE_TOOL = 'set_timezone';
export const CLARE_READ_PROTOCOL_TOOL = 'read_protocol';
export const CLARE_UPDATE_PROTOCOL_TOOL = 'update_protocol';

export const CLARE_AGENT_TOOLS: AnthropicTool[] = [
  {
    name: CLARE_CHECK_CLOCK_TOOL,
    description:
      "Look up Adam's current calendar day and local time in the hub timezone. Call when unsure, corrected, or asked — never invent a date.",
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you are checking (short).' }
      },
      additionalProperties: false
    }
  },
  {
    name: CLARE_SET_TIMEZONE_TOOL,
    description:
      'Remember Adam\'s timezone from chat (city or IANA id). Persists for later turns.',
    input_schema: {
      type: 'object',
      properties: {
        timezone_or_city: {
          type: 'string',
          description: 'e.g. "Sydney", "Australia/Sydney".'
        }
      },
      required: ['timezone_or_city'],
      additionalProperties: false
    }
  },
  {
    name: CLARE_READ_PROTOCOL_TOOL,
    description:
      'Read your current operating protocol (the live manual you follow). Call before editing it.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' }
      },
      additionalProperties: false
    }
  },
  {
    name: CLARE_UPDATE_PROTOCOL_TOOL,
    description:
      'Rewrite your own operating protocol from chat. Use when Adam asks you to change how you work, or when a durable preference should stick. Modes: replace (full), append, replace_section (needs section_heading matching a ## heading).',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['replace', 'append', 'replace_section']
        },
        section_heading: {
          type: 'string',
          description: 'For replace_section — e.g. "Clock" or "Voice".'
        },
        markdown: {
          type: 'string',
          description: 'Full protocol (replace), fragment (append), or section body (replace_section).'
        },
        reason: {
          type: 'string',
          description: 'Why this change sticks.'
        }
      },
      required: ['mode', 'markdown'],
      additionalProperties: false
    }
  }
];

export type ClareClockSnapshot = {
  timezone: string;
  today: string;
  today_weekday: string;
  local_time: string;
  utc: string;
};

export type ClareToolRuntime = {
  getTimezone: () => string | Promise<string>;
  setTimezone: (
    timezone: string
  ) => Promise<{ ok: boolean; timezone: string; note: string }> | { ok: boolean; timezone: string; note: string };
  getProtocol: () => string | Promise<string>;
  setProtocol: (
    markdown: string
  ) =>
    | Promise<{ ok: boolean; markdown: string; note: string }>
    | { ok: boolean; markdown: string; note: string };
  agentSlug?: AgentProtocolSlug;
  now?: () => Date;
};

function formatLocalTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(instant);
}

export function readClareClock(
  instant: Date = new Date(),
  timeZone: string = HUB_TZ
): ClareClockSnapshot {
  const zone = timeZone && timeZone.length ? timeZone : HUB_TZ;
  return {
    timezone: zone,
    today: toHubDateKey(instant, zone),
    today_weekday: hubWeekdayLong(instant, zone),
    local_time: formatLocalTime(instant, zone),
    utc: instant.toISOString()
  };
}

export function createClareToolHandler(runtime: ClareToolRuntime) {
  return async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    const now = runtime.now?.() ?? new Date();
    if (name === CLARE_CHECK_CLOCK_TOOL) {
      const timezone = await runtime.getTimezone();
      return {
        ...readClareClock(now, timezone),
        reason: typeof input.reason === 'string' ? input.reason.slice(0, 120) : null
      };
    }
    if (name === CLARE_SET_TIMEZONE_TOOL) {
      const raw = String(input.timezone_or_city ?? '').trim();
      const resolved = resolveTimeZoneInput(raw);
      if (!resolved) {
        return {
          ok: false,
          timezone: await runtime.getTimezone(),
          note: `Could not map "${raw}" to a timezone. Try a city (Sydney) or IANA id (Australia/Sydney).`
        };
      }
      const saved = await runtime.setTimezone(resolved);
      const clock = readClareClock(now, saved.timezone);
      return { ...saved, clock };
    }
    if (name === CLARE_READ_PROTOCOL_TOOL) {
      const markdown = await runtime.getProtocol();
      return {
        agent: runtime.agentSlug ?? 'clare',
        markdown,
        chars: markdown.length,
        reason: typeof input.reason === 'string' ? input.reason.slice(0, 120) : null
      };
    }
    if (name === CLARE_UPDATE_PROTOCOL_TOOL) {
      const mode = String(input.mode ?? 'replace') as ProtocolUpdateMode;
      if (mode !== 'replace' && mode !== 'append' && mode !== 'replace_section') {
        return { ok: false, note: 'mode must be replace, append, or replace_section.' };
      }
      const current = await runtime.getProtocol();
      const applied = applyProtocolUpdate(current, {
        mode,
        markdown: String(input.markdown ?? ''),
        section_heading:
          typeof input.section_heading === 'string' ? input.section_heading : undefined
      });
      if (!applied.ok) return applied;
      const saved = await runtime.setProtocol(applied.markdown);
      return {
        ...saved,
        reason: typeof input.reason === 'string' ? input.reason.slice(0, 200) : null
      };
    }
    return { ok: false, note: `Unknown tool: ${name}` };
  };
}
