import type { Task, TaskDomain } from '@/schemas/task';
import type { Project } from '@/schemas/project';

const PRIORITY_RANK: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function isSchoolDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/** Adaptive default domains: teaching on school days, life/wedding/health on weekends. */
export function preferredDomains(date: Date = new Date()): TaskDomain[] {
  return isSchoolDay(date) ? ['teaching', 'other'] : ['life', 'wedding', 'health', 'other'];
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDue(due: string | null): Date | null {
  if (!due) return null;
  const d = new Date(due);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sortByPriorityThenDue(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pr !== 0) return pr;
    const ad = parseDue(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = parseDue(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}

export function tasksForDay(tasks: Task[], day: Date): Task[] {
  const key = toDateKey(day);
  return sortByPriorityThenDue(
    tasks.filter((t) => {
      if (t.status === 'done' || t.status === 'dead') return false;
      const due = parseDue(t.due_date);
      if (!due) return false;
      return toDateKey(due) === key;
    })
  );
}

export function openTasks(tasks: Task[]): Task[] {
  return sortByPriorityThenDue(tasks.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'deferred'));
}

export function backlogTasks(tasks: Task[]): Task[] {
  return sortByPriorityThenDue(
    tasks.filter((t) => (t.status === 'open' || t.status === 'deferred') && !t.due_date)
  );
}

export function adaptiveTodayTasks(tasks: Task[], date: Date = new Date()): Task[] {
  const prefs = new Set(preferredDomains(date));
  const day = tasksForDay(tasks, date);
  const preferred = day.filter((t) => prefs.has(t.domain));
  const rest = day.filter((t) => !prefs.has(t.domain));
  // Prefer domain match first, then anything else due today.
  return [...preferred, ...rest];
}

export function weekDays(anchor: Date = new Date()): Date[] {
  const start = startOfDay(anchor);
  const mondayOffset = (start.getDay() + 6) % 7;
  const monday = addDays(start, -mondayOffset);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function milestonesInMonth(projects: Project[], month: Date): Array<{
  project: Project;
  milestone: Project['milestones'][number];
}> {
  const y = month.getFullYear();
  const m = month.getMonth();
  const out: Array<{ project: Project; milestone: Project['milestones'][number] }> = [];
  for (const project of projects) {
    for (const milestone of project.milestones) {
      const due = parseDue(milestone.due_date);
      if (due && due.getFullYear() === y && due.getMonth() === m) {
        out.push({ project, milestone });
      }
    }
  }
  return out.sort(
    (a, b) =>
      (parseDue(a.milestone.due_date)?.getTime() ?? 0) -
      (parseDue(b.milestone.due_date)?.getTime() ?? 0)
  );
}

export function searchEntities(
  tasks: Task[],
  projects: Project[],
  query: string
): { tasks: Task[]; projects: Project[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { tasks: [], projects: [] };
  return {
    tasks: tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    ),
    projects: projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.arc_summary.toLowerCase().includes(q)
    )
  };
}
