import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { parseDue, toDateKey } from '@/domain/queries';
import { projectChildTasks } from '@/domain/cards';

export const TIMELINE_PAD_TOP = 28;
export const TIMELINE_PAD_BOTTOM = 48;
export const TIMELINE_MIN_GAP = 96;
export const TIMELINE_PX_PER_DAY = 14;
export const TIMELINE_NODE_R = 14;

export type TimelineKind = 'task' | 'key_date' | 'event';

export type TimelineStop = {
  id: string;
  date: string;
  kind: TimelineKind;
  label: string;
  task: Task | null;
};

export type LaidTimelineStop = TimelineStop & {
  y: number;
  gap: number;
};

export type TimelineLayout = {
  stops: LaidTimelineStop[];
  height: number;
};

const KEY_DATE_ROWS: Array<[string, (project: Project) => string | null | undefined]> = [
  ['Permission note', (project) => project.key_dates?.permission_note_due],
  ['Staff notification', (project) => project.key_dates?.staff_notification_due],
  ['Risk assessment', (project) => project.key_dates?.risk_assessment_due],
  ['Payment', (project) => project.key_dates?.payment_due]
];

function dateKey(value: string | null | undefined): string | null {
  const parsed = parseDue(value ?? null);
  return parsed ? toDateKey(parsed) : null;
}

/** Tasks, unused key dates, and the event — one stop per moment, earliest first. */
export function collectExcursionStops(project: Project, tasks: Task[]): TimelineStop[] {
  const children = projectChildTasks(project, tasks);
  const taskDates = new Set(
    children.map((task) => dateKey(task.due_date)).filter((key): key is string => Boolean(key))
  );
  const stops: TimelineStop[] = children.map((task) => ({
    id: task.id,
    date: dateKey(task.due_date) ?? dateKey(task.created_at) ?? toDateKey(new Date()),
    kind: 'task',
    label: task.title,
    task
  }));

  for (const [label, read] of KEY_DATE_ROWS) {
    const date = dateKey(read(project) ?? null);
    if (!date || taskDates.has(date)) continue;
    stops.push({
      id: `key:${label}:${date}`,
      date,
      kind: 'key_date',
      label,
      task: null
    });
  }

  const event = dateKey(project.current_end_date);
  if (event) {
    stops.push({
      id: `event:${project.id}`,
      date: event,
      kind: 'event',
      label: 'Event',
      task: null
    });
  }

  return stops.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind === b.kind) return a.label.localeCompare(b.label);
    if (a.kind === 'event') return 1;
    if (b.kind === 'event') return -1;
    if (a.kind === 'task') return -1;
    if (b.kind === 'task') return 1;
    return 0;
  });
}

/** Map dates onto a vertical rail. Gaps grow with days, then a min gap keeps cards clear. */
export function layoutExcursionTimeline(
  stops: TimelineStop[],
  options: {
    padTop?: number;
    padBottom?: number;
    minGap?: number;
    pxPerDay?: number;
  } = {}
): TimelineLayout {
  const padTop = options.padTop ?? TIMELINE_PAD_TOP;
  const padBottom = options.padBottom ?? TIMELINE_PAD_BOTTOM;
  const minGap = options.minGap ?? TIMELINE_MIN_GAP;
  const pxPerDay = options.pxPerDay ?? TIMELINE_PX_PER_DAY;
  if (!stops.length) {
    return { stops: [], height: padTop + padBottom };
  }

  const first = parseDue(stops[0]!.date)?.getTime() ?? 0;
  let prevY = 0;
  const laid: LaidTimelineStop[] = stops.map((stop, index) => {
    const at = parseDue(stop.date)?.getTime() ?? first;
    const ideal = padTop + Math.max(0, (at - first) / 86_400_000) * pxPerDay;
    const y = index === 0 ? ideal : Math.max(ideal, prevY + minGap);
    const gap = index === 0 ? padTop : y - prevY;
    prevY = y;
    return { ...stop, y, gap };
  });

  return {
    stops: laid,
    height: prevY + padBottom
  };
}
