import type { AnthropicTool } from '@/ai/anthropic';
import { resolveTimeZoneInput } from '@/domain/hub-prefs';
import { HUB_TZ, hubWeekdayLong, toHubDateKey } from '@/domain/queries';

export const CLARE_CHECK_CLOCK_TOOL = 'check_clock';
export const CLARE_SET_TIMEZONE_TOOL = 'set_timezone';

export const CLARE_AGENT_TOOLS: AnthropicTool[] = [
  {
    name: CLARE_CHECK_CLOCK_TOOL,
    description:
      'Look up Adam\'s current calendar day and local time in the hub timezone. Call this when he asks what day it is, corrects the date, or says where he is — do not invent a date from memory.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why you are checking (short).'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: CLARE_SET_TIMEZONE_TOOL,
    description:
      'Remember Adam\'s timezone from chat (city name or IANA id like Australia/Sydney). Call when he says where he is or that the clock is wrong for his place. Persists for later dumps.',
    input_schema: {
      type: 'object',
      properties: {
        timezone_or_city: {
          type: 'string',
          description: 'e.g. "Sydney", "Australia/Sydney", "Melbourne".'
        }
      },
      required: ['timezone_or_city'],
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
    return { ok: false, note: `Unknown tool: ${name}` };
  };
}
