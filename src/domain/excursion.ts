import type { ExcursionTemplate } from '@/schemas/templates';
import type { Task } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';

export const SCHOOL_EXCURSION_TEMPLATE_ID = 'ext_school_excursion';

/** Fallback admin profile for any program that is not a specialised template. */
export const SCHOOL_EXCURSION_TEMPLATE: ExcursionTemplate = {
  schema_version: 1,
  id: SCHOOL_EXCURSION_TEMPLATE_ID,
  name: 'School excursion',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: [
    'Permission note drafted and sent',
    'Staff absence email sent',
    'Risk assessment lodged',
    'Payment confirmed',
    'Student list finalised',
    'Travel / venue logistics'
  ]
};

export function withSchoolExcursionTemplate(templates: ExcursionTemplate[]): ExcursionTemplate[] {
  if (templates.some((item) => item.id === SCHOOL_EXCURSION_TEMPLATE_ID)) return templates;
  return [...templates, SCHOOL_EXCURSION_TEMPLATE];
}

export function resolveExcursionTemplate(
  id: string | null | undefined,
  templates: ExcursionTemplate[]
): ExcursionTemplate {
  if (id) {
    const found = templates.find((item) => item.id === id);
    if (found) return found;
    if (id === SCHOOL_EXCURSION_TEMPLATE_ID) return SCHOOL_EXCURSION_TEMPLATE;
  }
  return templates.find((item) => item.id === SCHOOL_EXCURSION_TEMPLATE_ID) ?? SCHOOL_EXCURSION_TEMPLATE;
}

/** Pick a specialised admin profile when the title matches; otherwise the generic one. */
export function suggestExcursionTemplate(name: string, templates: ExcursionTemplate[]): ExcursionTemplate {
  const lower = name.trim().toLowerCase();
  if (lower) {
    const match = templates.find((item) => {
      if (item.id === SCHOOL_EXCURSION_TEMPLATE_ID) return false;
      const label = item.name.toLowerCase();
      return lower.includes(label) || label.includes(lower);
    });
    if (match) return match;
  }
  return resolveExcursionTemplate(SCHOOL_EXCURSION_TEMPLATE_ID, templates);
}

export type AdminTaskKind =
  | 'permission_note'
  | 'staff_email'
  | 'risk_assessment'
  | 'payment'
  | 'checklist'
  | 'event';

export type PlannedAdminTask = {
  kind: AdminTaskKind;
  title: string;
  description: string;
  due_date: string;
  estimated_duration: number;
  priority: Task['priority'];
  tags: string[];
};

export type ExcursionKeyDates = NonNullable<Project['key_dates']>;

export type ExcursionPlan = {
  key_dates: ExcursionKeyDates;
  event_date: string;
  milestones: Array<{ title: string; due_date: string; status: 'open' }>;
  admin_tasks: PlannedAdminTask[];
  drafted_documents: {
    permission_note_draft: string;
    staff_absence_email_draft: string;
  };
};

export type CreateExcursionInput = {
  title: string;
  event_date: string;
  student_group_reference?: string | null;
  description?: string;
};

function dueBeforeEvent(eventDate: Date, leadDays: number): string {
  return toDateKey(addDays(startOfDay(eventDate), -leadDays));
}

/** Map checklist lines that are covered by the four standard admin tasks. */
function isCoveredByAdminTask(item: string): boolean {
  const lower = item.toLowerCase();
  return (
    lower.includes('permission') ||
    lower.includes('staff absence') ||
    lower.includes('staff email') ||
    lower.includes('risk assessment') ||
    lower.includes('payment')
  );
}

export function draftPermissionNote(input: {
  title: string;
  eventDateLabel: string;
  studentGroup: string;
  competitionName: string;
}): string {
  const group = input.studentGroup || '[student group]';
  return [
    `Permission note — ${input.competitionName}`,
    '',
    `Dear Parent/Carer,`,
    '',
    `We are writing to seek permission for ${group} to take part in ${input.title} (${input.competitionName}) on ${input.eventDateLabel}.`,
    '',
    `Please return this note by the deadline shown in the Tasks Hub checklist so we can finalise logistics and staffing.`,
    '',
    `Kind regards,`,
    `Adam Russell`
  ].join('\n');
}

export function draftStaffAbsenceEmail(input: {
  title: string;
  eventDateLabel: string;
  studentGroup: string;
  competitionName: string;
}): string {
  const group = input.studentGroup || '[student group]';
  return [
    `Subject: Staff absence — ${input.competitionName} (${input.eventDateLabel})`,
    '',
    `Hi team,`,
    '',
    `I will be off-site with ${group} for ${input.title} (${input.competitionName}) on ${input.eventDateLabel}.`,
    '',
    `Please note any cover implications and reply if clashes need resolving.`,
    '',
    `Thanks,`,
    `Adam`
  ].join('\n');
}

/**
 * Build key dates, milestones, scheduled admin tasks, and draft documents
 * for an excursion template + event date (spec §5.6–5.7 / steps 5–6).
 */
export function buildExcursionPlan(
  template: ExcursionTemplate,
  input: CreateExcursionInput
): ExcursionPlan {
  const event = parseDue(input.event_date);
  if (!event) throw new Error(`Invalid event_date: ${input.event_date}`);
  const eventDay = startOfDay(event);
  const eventKey = toDateKey(eventDay);
  const weekday = eventDay.toLocaleDateString('en-AU', { weekday: 'long' });
  const eventLabel = `${weekday} ${formatDisplayDate(eventDay)}`;
  const group = input.student_group_reference?.trim() || '';
  const leads = template.default_lead_times;

  const key_dates: ExcursionKeyDates = {
    permission_note_due: dueBeforeEvent(eventDay, leads.permission_note_days),
    staff_notification_due: dueBeforeEvent(eventDay, leads.staff_email_days),
    risk_assessment_due: dueBeforeEvent(eventDay, leads.risk_assessment_days),
    payment_due:
      leads.payment_days !== undefined ? dueBeforeEvent(eventDay, leads.payment_days) : null
  };

  const admin_tasks: PlannedAdminTask[] = [
    {
      kind: 'permission_note',
      title: `Draft & send permission note — ${template.name}`,
      description: `Lead time ${leads.permission_note_days} days before event. Review drafted_documents.permission_note_draft on the excursion.`,
      due_date: key_dates.permission_note_due!,
      estimated_duration: 45,
      priority: 'high',
      tags: ['excursion', 'admin', 'permission']
    },
    {
      kind: 'staff_email',
      title: `Send staff absence notification — ${template.name}`,
      description: `Lead time ${leads.staff_email_days} days before event. Review drafted_documents.staff_absence_email_draft on the excursion.`,
      due_date: key_dates.staff_notification_due!,
      estimated_duration: 20,
      priority: 'high',
      tags: ['excursion', 'admin', 'staff']
    },
    {
      kind: 'risk_assessment',
      title: `Lodge risk assessment — ${template.name}`,
      description: `Lead time ${leads.risk_assessment_days} days before event.`,
      due_date: key_dates.risk_assessment_due!,
      estimated_duration: 60,
      priority: 'urgent',
      tags: ['excursion', 'admin', 'risk']
    }
  ];

  if (key_dates.payment_due) {
    admin_tasks.push({
      kind: 'payment',
      title: `Confirm payment — ${template.name}`,
      description: `Lead time ${leads.payment_days} days before event.`,
      due_date: key_dates.payment_due,
      estimated_duration: 30,
      priority: 'high',
      tags: ['excursion', 'admin', 'payment']
    });
  }

  for (const item of template.checklist_items) {
    if (isCoveredByAdminTask(item)) continue;
    admin_tasks.push({
      kind: 'checklist',
      title: `${item} — ${template.name}`,
      description: `Checklist item from ${template.name} template.`,
      due_date: eventKey,
      estimated_duration: 30,
      priority: 'medium',
      tags: ['excursion', 'checklist']
    });
  }

  admin_tasks.push({
    kind: 'event',
    title: `Event day — ${input.title}`,
    description: `${template.name} event.`,
    due_date: eventKey,
    estimated_duration: 480,
    priority: 'urgent',
    tags: ['excursion', 'event']
  });

  const milestones = [
    ...template.checklist_items.map((title) => ({
      title,
      due_date: eventKey,
      status: 'open' as const
    })),
    {
      title: 'Event day',
      due_date: eventKey,
      status: 'open' as const
    }
  ];

  return {
    key_dates,
    event_date: eventKey,
    milestones,
    admin_tasks,
    drafted_documents: {
      permission_note_draft: draftPermissionNote({
        title: input.title,
        eventDateLabel: eventLabel,
        studentGroup: group,
        competitionName: template.name
      }),
      staff_absence_email_draft: draftStaffAbsenceEmail({
        title: input.title,
        eventDateLabel: eventLabel,
        studentGroup: group,
        competitionName: template.name
      })
    }
  };
}

/** Summarise lead-time offsets for UI preview. */
export function formatLeadTimes(template: ExcursionTemplate): string {
  const l = template.default_lead_times;
  const parts = [
    `permission −${l.permission_note_days}d`,
    `staff −${l.staff_email_days}d`,
    `risk −${l.risk_assessment_days}d`
  ];
  if (l.payment_days !== undefined) parts.push(`payment −${l.payment_days}d`);
  return parts.join(' · ');
}

/** Short create-form preview — task count and event day, not every lead time. */
export function formatExcursionPreview(taskCount: number, eventDate: string): string {
  return `${taskCount} admin tasks · event ${formatDisplayDate(eventDate)}`;
}
