import type { Project } from '@/schemas/project';
import { addDays, parseDue, startOfDay } from '@/domain/queries';

export type UpcomingExcursionItem = {
  project: Project;
  label: string;
  due_date: string;
  daysOut: number;
};

const EXCURSION_DATE_LABELS: Array<[string, (project: Project) => string | null | undefined]> = [
  ['Permission note', (p) => p.key_dates?.permission_note_due],
  ['Staff notification', (p) => p.key_dates?.staff_notification_due],
  ['Risk assessment', (p) => p.key_dates?.risk_assessment_due],
  ['Payment', (p) => p.key_dates?.payment_due],
  ['Event', (p) => p.current_end_date]
];

/** Excursion admin key dates within a forward horizon (default 90 days). */
export function upcomingExcursionDates(
  projects: Project[],
  now: Date = new Date(),
  horizonDays = 90
): UpcomingExcursionItem[] {
  const start = startOfDay(now);
  const end = addDays(start, horizonDays);
  const out: UpcomingExcursionItem[] = [];

  for (const project of projects) {
    if (project.type !== 'excursion') continue;
    if (project.status === 'archived_dead') continue;
    for (const [label, read] of EXCURSION_DATE_LABELS) {
      const due_date = read(project);
      if (!due_date) continue;
      const due = parseDue(due_date);
      if (!due) continue;
      const day = startOfDay(due);
      if (day < start || day > end) continue;
      const daysOut = Math.round((day.getTime() - start.getTime()) / 86_400_000);
      out.push({ project, label, due_date, daysOut });
    }
  }

  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
