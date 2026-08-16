import type { Task } from '@/schemas/task';
import type { Project, Milestone } from '@/schemas/project';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';

const DAY_MS = 24 * 60 * 60 * 1000;

export type GanttRowKind = 'task' | 'milestone';

export type GanttRow = {
  id: string;
  kind: GanttRowKind;
  label: string;
  start: Date;
  end: Date;
  status: string;
  dependsOn: string[];
  /** Estimated duration in minutes when known (tasks only). */
  estimatedMinutes: number | null;
};

export type GanttBarLayout = {
  row: GanttRow;
  rowIndex: number;
  x: number;
  width: number;
  y: number;
};

export type GanttEdgeLayout = {
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type GanttLayout = {
  rangeStart: Date;
  rangeEnd: Date;
  dayCount: number;
  dayWidth: number;
  labelWidth: number;
  rowHeight: number;
  bars: GanttBarLayout[];
  edges: GanttEdgeLayout[];
  totalWidth: number;
  totalHeight: number;
  ticks: Date[];
};

function taskSpan(task: Task): { start: Date; end: Date } | null {
  const due = parseDue(task.due_date);
  if (!due) return null;
  const end = startOfDay(due);
  const minutes = task.estimated_duration ?? 60;
  const days = Math.max(1, Math.ceil(minutes / (60 * 8)));
  const start = addDays(end, -(days - 1));
  return { start, end };
}

function milestoneSpan(milestone: Milestone): { start: Date; end: Date } | null {
  const due = parseDue(milestone.due_date);
  if (!due) return null;
  const day = startOfDay(due);
  return { start: day, end: day };
}

/** Build Gantt rows for one project — tasks with dates + milestones. */
export function buildProjectGanttRows(project: Project, tasks: Task[]): GanttRow[] {
  const projectTasks = tasks.filter((t) => t.parent_project_id === project.id && t.status !== 'dead');
  const rows: GanttRow[] = [];

  for (const task of projectTasks) {
    const span = taskSpan(task);
    if (!span) continue;
    rows.push({
      id: task.id,
      kind: 'task',
      label: task.title,
      start: span.start,
      end: span.end,
      status: task.status,
      dependsOn: task.depends_on.filter((id) => projectTasks.some((t) => t.id === id)),
      estimatedMinutes: task.estimated_duration
    });
  }

  for (const milestone of project.milestones) {
    const span = milestoneSpan(milestone);
    if (!span) continue;
    rows.push({
      id: milestone.id,
      kind: 'milestone',
      label: milestone.title,
      start: span.start,
      end: span.end,
      status: milestone.status,
      dependsOn: [],
      estimatedMinutes: null
    });
  }

  return rows.sort((a, b) => a.start.getTime() - b.start.getTime() || a.label.localeCompare(b.label));
}

export function computeGanttRange(rows: GanttRow[], padDays = 2): { start: Date; end: Date } | null {
  if (!rows.length) return null;
  let min = rows[0]!.start.getTime();
  let max = rows[0]!.end.getTime();
  for (const row of rows) {
    min = Math.min(min, row.start.getTime());
    max = Math.max(max, row.end.getTime());
  }
  return {
    start: addDays(startOfDay(new Date(min)), -padDays),
    end: addDays(startOfDay(new Date(max)), padDays)
  };
}

function dayOffset(rangeStart: Date, date: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(rangeStart).getTime()) / DAY_MS);
}

export function layoutGantt(
  rows: GanttRow[],
  options: { dayWidth?: number; labelWidth?: number; rowHeight?: number; padDays?: number } = {}
): GanttLayout | null {
  const dayWidth = options.dayWidth ?? 28;
  const labelWidth = options.labelWidth ?? 200;
  const rowHeight = options.rowHeight ?? 36;
  const range = computeGanttRange(rows, options.padDays ?? 2);
  if (!range) return null;

  const dayCount = dayOffset(range.start, range.end) + 1;
  const bars: GanttBarLayout[] = rows.map((row, rowIndex) => {
    const startOff = dayOffset(range.start, row.start);
    const endOff = dayOffset(range.start, row.end);
    const spanDays = Math.max(1, endOff - startOff + 1);
    return {
      row,
      rowIndex,
      x: labelWidth + startOff * dayWidth,
      width: Math.max(dayWidth * 0.7, spanDays * dayWidth - 4),
      y: rowIndex * rowHeight + 8
    };
  });

  const byId = new Map(bars.map((b) => [b.row.id, b]));
  const edges: GanttEdgeLayout[] = [];
  for (const bar of bars) {
    for (const depId of bar.row.dependsOn) {
      const from = byId.get(depId);
      if (!from) continue;
      edges.push({
        fromId: depId,
        toId: bar.row.id,
        x1: from.x + from.width,
        y1: from.y + 10,
        x2: bar.x,
        y2: bar.y + 10
      });
    }
  }

  const ticks: Date[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const d = addDays(range.start, i);
    // Monday ticks + first/last for readability on long ranges
    if (i === 0 || i === dayCount - 1 || d.getDay() === 1) ticks.push(d);
  }

  return {
    rangeStart: range.start,
    rangeEnd: range.end,
    dayCount,
    dayWidth,
    labelWidth,
    rowHeight,
    bars,
    edges,
    totalWidth: labelWidth + dayCount * dayWidth + 24,
    totalHeight: Math.max(rowHeight, rows.length * rowHeight + 48),
    ticks
  };
}

export function formatTick(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export { toDateKey };
