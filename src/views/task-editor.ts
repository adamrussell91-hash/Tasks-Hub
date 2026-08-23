import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import type { RecurrenceFrequency } from '@/schemas/recurrence';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { formatTagsInput, parseTagsInput, stepsForTask } from '@/domain/hierarchy';
import {
  defaultRecurrenceRule,
  formatRecurrenceLabel,
  parseRecurrenceRule,
  serializeRecurrenceRule
} from '@/domain/recurrence';
import {
  inferRemindPreset,
  remindAtFromPreset,
  type RemindPreset
} from '@/domain/reminders';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const DOMAINS: TaskDomain[] = ['teaching', 'life', 'wedding', 'health', 'other'];
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];
const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' }
];
const REMIND_PRESETS: Array<{ value: RemindPreset; label: string }> = [
  { value: 'none', label: 'No reminder' },
  { value: 'morning_of', label: 'Morning of due date (9am)' },
  { value: '1_day_before', label: '1 day before (9am)' },
  { value: '1_hour_before', label: '1 hour before due time' },
  { value: 'custom', label: 'Custom date & time' }
];

function renderRecurrenceSection(task: Task): {
  section: HTMLElement;
  read: () => string | null;
} {
  const section = el('section', 'task-editor__repeat');
  section.append(el('h3', 'task-editor__repeat-title', 'Repeat'));

  const existing = parseRecurrenceRule(task.recurrence_rule);
  const enabled = el('input') as HTMLInputElement;
  enabled.type = 'checkbox';
  enabled.checked = Boolean(existing);
  enabled.id = 'task-repeat-enabled';
  const enabledLabel = el('label', 'task-editor__check-label', 'Repeating task');
  enabledLabel.htmlFor = enabled.id;
  section.append(enabledLabel, enabled);

  const panel = el('div', 'task-editor__repeat-panel');
  panel.hidden = !enabled.checked;

  const freq = el('select', 'hub-filter') as HTMLSelectElement;
  freq.setAttribute('aria-label', 'Repeat frequency');
  for (const value of FREQUENCIES) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (existing?.frequency === value) opt.selected = true;
    freq.append(opt);
  }

  const interval = el('input', 'hub-search') as HTMLInputElement;
  interval.type = 'number';
  interval.min = '1';
  interval.step = '1';
  interval.value = String(existing?.interval ?? 1);
  interval.setAttribute('aria-label', 'Repeat every');

  const count = el('input', 'hub-search') as HTMLInputElement;
  count.type = 'number';
  count.min = '1';
  count.step = '1';
  count.placeholder = 'Forever';
  count.value = existing?.count != null ? String(existing.count) : '';
  count.setAttribute('aria-label', 'Repeat count');

  const weekday = el('select', 'hub-filter') as HTMLSelectElement;
  weekday.setAttribute('aria-label', 'Repeat on weekday');
  for (const day of WEEKDAYS) {
    const opt = document.createElement('option');
    opt.value = String(day.value);
    opt.textContent = day.label;
    if ((existing?.weekday ?? 1) === day.value) opt.selected = true;
    weekday.append(opt);
  }

  const summary = el('p', 'hierarchy-meta');

  const readRule = () => {
    if (!enabled.checked) return null;
    return defaultRecurrenceRule({
      frequency: freq.value as RecurrenceFrequency,
      interval: Math.max(1, Number(interval.value) || 1),
      count: count.value.trim() ? Math.max(1, Number(count.value) || 1) : null,
      completed_count: existing?.completed_count ?? 0,
      weekday: freq.value === 'weekly' ? Number(weekday.value) : undefined,
      series_id: existing?.series_id
    });
  };

  const paintSummary = () => {
    const rule = readRule();
    summary.textContent = rule ? formatRecurrenceLabel(rule) : 'Not repeating';
    weekday.hidden = freq.value !== 'weekly';
  };

  enabled.addEventListener('change', () => {
    panel.hidden = !enabled.checked;
    paintSummary();
  });
  for (const input of [freq, interval, count, weekday]) {
    input.addEventListener('change', paintSummary);
    input.addEventListener('input', paintSummary);
  }

  panel.append(
    el('label', 'task-editor__field-label', 'Frequency'),
    freq,
    el('label', 'task-editor__field-label', 'Every'),
    interval,
    el('label', 'task-editor__field-label', 'On'),
    weekday,
    el('label', 'task-editor__field-label', 'Times (blank = forever)'),
    count,
    summary
  );
  section.append(panel);
  paintSummary();

  return {
    section,
    read: () => serializeRecurrenceRule(readRule())
  };
}

function renderRemindSection(task: Task): {
  section: HTMLElement;
  dueTimeInput: HTMLInputElement;
  read: (dueDate: string | null, dueTime: string | null) => {
    remind_at: string | null;
    remind_dismissed_at: string | null;
  };
} {
  const section = el('section', 'task-editor__remind');
  section.append(el('h3', 'task-editor__remind-title', 'Notify me'));

  const preset = el('select', 'hub-filter') as HTMLSelectElement;
  preset.setAttribute('aria-label', 'Reminder preset');
  const initialPreset = inferRemindPreset(task.remind_at, task.due_date, task.due_time);
  for (const item of REMIND_PRESETS) {
    const opt = document.createElement('option');
    opt.value = item.value;
    opt.textContent = item.label;
    if (item.value === initialPreset) opt.selected = true;
    preset.append(opt);
  }

  const dueTime = el('input', 'hub-search') as HTMLInputElement;
  dueTime.type = 'time';
  dueTime.value = task.due_time ?? '';
  dueTime.setAttribute('aria-label', 'Due time');

  const custom = el('input', 'hub-search') as HTMLInputElement;
  custom.type = 'datetime-local';
  custom.hidden = preset.value !== 'custom';
  if (task.remind_at && initialPreset === 'custom') {
    const d = new Date(task.remind_at);
    if (!Number.isNaN(d.getTime())) {
      custom.value = d.toISOString().slice(0, 16);
    }
  }
  custom.setAttribute('aria-label', 'Custom reminder time');

  preset.addEventListener('change', () => {
    custom.hidden = preset.value !== 'custom';
  });

  section.append(
    preset,
    el('label', 'task-editor__field-label', 'Due time (optional)'),
    dueTime,
    custom
  );

  return {
    section,
    dueTimeInput: dueTime,
    read: (dueDate, dueTimeValue) => {
      const selected = preset.value as RemindPreset;
      const customIso =
        selected === 'custom' && custom.value
          ? new Date(custom.value).toISOString()
          : null;
      const remind_at = remindAtFromPreset(
        selected,
        dueDate,
        dueTimeValue,
        customIso
      );
      const remind_dismissed_at =
        remind_at && task.remind_at && remind_at !== task.remind_at ? null : task.remind_dismissed_at;
      return { remind_at, remind_dismissed_at };
    }
  };
}

function renderSteps(
  host: HTMLElement,
  task: Task,
  allTasks: Task[],
  onSaved: () => void | Promise<void>
): void {
  const section = el('section', 'task-editor__steps');
  section.append(el('h3', 'task-editor__steps-title', 'Steps'));

  const list = el('ul', 'task-editor__step-list');
  const steps = stepsForTask(allTasks, task.id);

  const paint = (): void => {
    list.replaceChildren();
    for (const step of stepsForTask(allTasks, task.id)) {
      const item = el('li', 'task-editor__step');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = step.status === 'done';
      check.setAttribute('aria-label', `Complete ${step.title}`);
      check.addEventListener('change', () => {
        void tasksApi
          .updateTask(step.id, { status: check.checked ? 'done' : 'open' })
          .then(async () => {
            const fresh = await tasksApi.listTasks();
            allTasks.length = 0;
            allTasks.push(...fresh);
            paint();
            await onSaved();
          })
          .catch((err) => window.alert(errorMessage(err)));
      });
      const label = el('span', 'task-editor__step-label', step.title);
      item.append(check, label);
      list.append(item);
    }
  };
  paint();
  section.append(list);

  const addRow = el('form', 'task-editor__step-add');
  const input = el('input', 'hub-search') as HTMLInputElement;
  input.placeholder = 'Add a step';
  input.setAttribute('aria-label', 'New step');
  const addBtn = el('button', 'btn btn--secondary', 'Add step');
  addBtn.type = 'submit';
  addRow.append(input, addBtn);
  addRow.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) return;
    addBtn.disabled = true;
    try {
      const created = await tasksApi.createTask({
        title,
        domain: task.domain,
        parent_task_id: task.id,
        parent_project_id: task.parent_project_id,
        kind: 'step',
        step_order: steps.length,
        bucket: 'active',
        status: 'open'
      });
      allTasks.push(created);
      input.value = '';
      paint();
      await onSaved();
    } catch (err) {
      section.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      addBtn.disabled = false;
    }
  });
  section.append(addRow);
  host.append(section);
}

/** Inline edit panel — title, due, domain, project, tags, notes, steps. */
export async function renderTaskEditor(
  host: HTMLElement,
  task: Task,
  projects: Project[],
  onSaved: () => void | Promise<void>
): Promise<void> {
  host.replaceChildren();
  const allTasks = await tasksApi.listTasks();

  const card = el('section', 'confirm-card task-editor');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Edit task');
  card.append(el('p', 'page-header__eyebrow', task.kind === 'step' ? 'Edit step' : 'Edit task'));
  card.append(el('h2', 'page-header__title', task.title));

  const title = el('input', 'hub-search') as HTMLInputElement;
  title.value = task.title;
  title.setAttribute('aria-label', 'Title');

  const due = el('input', 'hub-search') as HTMLInputElement;
  due.type = 'date';
  due.value = task.due_date ?? '';
  due.setAttribute('aria-label', 'Due date');

  const recurrence = renderRecurrenceSection(task);
  const remind = renderRemindSection(task);

  const domain = el('select', 'hub-filter') as HTMLSelectElement;
  domain.setAttribute('aria-label', 'Domain');
  for (const value of DOMAINS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === task.domain) opt.selected = true;
    domain.append(opt);
  }

  const priority = el('select', 'hub-filter') as HTMLSelectElement;
  priority.setAttribute('aria-label', 'Priority');
  for (const value of PRIORITIES) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === task.priority) opt.selected = true;
    priority.append(opt);
  }

  const project = el('select', 'hub-filter') as HTMLSelectElement;
  project.setAttribute('aria-label', 'Project');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No project';
  project.append(none);
  for (const item of projects.filter((p) => p.status !== 'archived_dead')) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.title;
    if (item.id === task.parent_project_id) opt.selected = true;
    project.append(opt);
  }

  const tags = el('input', 'hub-search') as HTMLInputElement;
  tags.value = formatTagsInput(task.tags);
  tags.placeholder = 'Tags — urgent, waiting, marking';
  tags.setAttribute('aria-label', 'Tags');

  const notes = document.createElement('textarea');
  notes.className = 'hub-search task-editor__notes';
  notes.value = task.description;
  notes.rows = 3;
  notes.setAttribute('aria-label', 'Notes');

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const save = el('button', 'btn btn--primary', 'Save');
  save.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  save.addEventListener('click', async () => {
    const nextTitle = title.value.trim();
    if (!nextTitle) {
      host.append(el('p', 'empty-state', 'Add a title.'));
      return;
    }
    save.disabled = true;
    discard.disabled = true;
    try {
      const dueValue = due.value || null;
      const dueTimeValue = remind.dueTimeInput.value || null;
      const reminder = remind.read(dueValue, dueTimeValue);
      await tasksApi.updateTask(task.id, {
        title: nextTitle,
        due_date: dueValue,
        due_time: dueTimeValue,
        domain: domain.value,
        priority: priority.value,
        parent_project_id: project.value || null,
        description: notes.value.trim(),
        tags: parseTagsInput(tags.value),
        recurrence_rule: recurrence.read(),
        remind_at: reminder.remind_at,
        remind_dismissed_at: reminder.remind_dismissed_at
      });
      await onSaved();
    } catch (err) {
      save.disabled = false;
      discard.disabled = false;
      host.append(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, save);
  card.append(title, due, domain, priority, project, tags, notes);
  if (task.kind !== 'step' && !task.parent_task_id) {
    card.append(recurrence.section, remind.section);
  }
  card.append(actions);
  host.append(card);

  if (task.kind !== 'step' && !task.parent_task_id) {
    renderSteps(host, task, allTasks, onSaved);
  }

  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function renderQuickAdd(
  onCreated: () => void,
  projectId: string | null = null
): HTMLElement {
  const form = el('form', 'quick-add');
  const title = el('input', 'hub-search') as HTMLInputElement;
  title.placeholder = 'New task title';
  title.required = true;
  title.setAttribute('aria-label', 'New task title');
  const domain = el('select', 'hub-filter') as HTMLSelectElement;
  domain.setAttribute('aria-label', 'Domain');
  for (const d of DOMAINS) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    domain.append(opt);
  }
  const submit = el('button', 'btn btn--primary', 'Add');
  submit.type = 'submit';
  form.append(title, domain, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await tasksApi.createTask({
        title: title.value.trim(),
        domain: domain.value,
        parent_project_id: projectId,
        kind: 'task',
        bucket: 'active'
      });
      title.value = '';
      onCreated();
    } catch (err) {
      form.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}
