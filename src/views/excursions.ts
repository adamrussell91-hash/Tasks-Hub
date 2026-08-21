import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import { buildExcursionPlan, formatLeadTimes } from '@/domain/excursion';
import { addDays, toDateKey } from '@/domain/queries';

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

function defaultEventDate(): string {
  return toDateKey(addDays(new Date(), 45));
}

function showConfirm(
  host: HTMLElement,
  summary: string,
  onConfirm: () => Promise<void>
): void {
  host.replaceChildren();
  const card = el('div', 'confirm-card');
  card.append(el('p', undefined, summary));
  const actions = el('div', 'confirm-card__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  const ok = el('button', 'btn btn--decisive', 'Create excursion');
  ok.type = 'button';
  cancel.addEventListener('click', () => host.replaceChildren());
  ok.addEventListener('click', async () => {
    ok.disabled = true;
    cancel.disabled = true;
    try {
      await onConfirm();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Create failed')
      );
    } finally {
      ok.disabled = false;
      cancel.disabled = false;
    }
  });
  actions.append(cancel, ok);
  card.append(actions);
  host.append(card);
}

function renderDrafts(project: Project): HTMLElement {
  const wrap = el('div', 'excursion-drafts');
  wrap.append(el('h3', 'section-title', 'Drafted documents'));
  const docs = project.drafted_documents;
  if (!docs?.permission_note_draft && !docs?.staff_absence_email_draft) {
    wrap.append(el('p', 'empty-state', 'No drafts on this excursion.'));
    return wrap;
  }
  if (docs.permission_note_draft) {
    wrap.append(el('h4', 'excursion-drafts__label', 'Permission note'));
    const pre = el('pre', 'excursion-draft');
    pre.textContent = docs.permission_note_draft;
    wrap.append(pre);
  }
  if (docs.staff_absence_email_draft) {
    wrap.append(el('h4', 'excursion-drafts__label', 'Staff absence email'));
    const pre = el('pre', 'excursion-draft');
    pre.textContent = docs.staff_absence_email_draft;
    wrap.append(pre);
  }
  return wrap;
}

function renderExcursionCard(
  project: Project,
  tasks: Task[],
  templatesById: Map<string, ExcursionTemplate>,
  onSelect: () => void
): HTMLElement {
  const row = el('article', 'task-row');
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  const tplName =
    (project.competition_or_event_type &&
      templatesById.get(project.competition_or_event_type)?.name) ||
    project.competition_or_event_type ||
    'excursion';
  row.append(
    el('h3', 'task-row__title', project.title),
    el('p', 'task-row__desc', project.arc_summary || project.description)
  );
  const meta = el('div', 'task-row__meta');
  meta.append(
    el('span', 'chip', tplName),
    el('span', 'chip chip--muted', project.current_end_date ?? 'no date'),
    el('span', 'chip chip--muted', `${project.generated_admin_tasks.length} admin tasks`)
  );
  row.append(meta);
  const open = () => onSelect();
  row.addEventListener('click', open);
  row.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });
  void tasks;
  return row;
}

function renderDetail(
  host: HTMLElement,
  project: Project,
  tasks: Task[],
  template: ExcursionTemplate | undefined
): void {
  host.replaceChildren();
  host.append(el('h2', 'section-title', project.title));
  host.append(
    el(
      'p',
      'view-lede',
      template
        ? `${template.name} · lead times ${formatLeadTimes(template)}`
        : project.arc_summary || 'Excursion detail'
    )
  );

  const keys = el('div', 'excursion-key-dates');
  keys.append(el('h3', 'section-title', 'Key dates'));
  const kd = project.key_dates;
  if (!kd) {
    keys.append(el('p', 'empty-state', 'No key dates.'));
  } else {
    const list = el('ul', 'excursion-key-dates__list');
    const rows: Array<[string, string | null | undefined]> = [
      ['Permission note', kd.permission_note_due],
      ['Staff notification', kd.staff_notification_due],
      ['Risk assessment', kd.risk_assessment_due],
      ['Payment', kd.payment_due],
      ['Event', project.current_end_date]
    ];
    for (const [label, date] of rows) {
      if (!date) continue;
      const li = el('li');
      li.append(el('span', 'chip', label), el('span', 'chip chip--muted', date));
      list.append(li);
    }
    keys.append(list);
  }
  host.append(keys);

  const admin = el('div', 'task-stack');
  admin.append(el('h3', 'section-title', 'Scheduled admin tasks'));
  const adminTasks = tasks.filter((t) => project.generated_admin_tasks.includes(t.id));
  if (!adminTasks.length) {
    admin.append(el('p', 'empty-state', 'No admin tasks linked.'));
  } else {
    for (const task of adminTasks.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))) {
      const row = el('article', 'task-row');
      row.append(
        el('h3', 'task-row__title', task.title),
        el('div', 'task-row__meta')
      );
      const meta = row.querySelector('.task-row__meta')!;
      meta.append(
        el('span', 'chip chip--muted', task.due_date?.slice(0, 10) ?? 'undated'),
        el('span', 'chip', task.priority),
        el('span', 'chip chip--muted', task.source)
      );
      admin.append(row);
    }
  }
  host.append(admin);
  host.append(renderDrafts(project));
}

/** Dedicated excursions module — create from template with auto-scheduled admin tasks. */
export async function renderExcursionsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursions…'));
  const [projects, tasks, templatesPayload] = await Promise.all([
    tasksApi.listProjects(),
    tasksApi.listTasks(),
    tasksApi.listTemplates()
  ]);
  const templates = templatesPayload.excursion_templates as ExcursionTemplate[];
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const excursions = projects.filter((p) => p.type === 'excursion');

  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      'Pick a competition template, set the event date, and admin tasks schedule themselves from lead times.'
    )
  );

  const form = el('form', 'excursion-form');
  form.append(el('h2', 'section-title', 'New excursion'));

  const templateSelect = el('select', 'quick-add__select') as HTMLSelectElement;
  templateSelect.setAttribute('aria-label', 'Excursion template');
  templateSelect.required = true;
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.name} (${formatLeadTimes(t)})`;
    templateSelect.append(opt);
  }

  const title = el('input', 'sign-in__input') as HTMLInputElement;
  title.placeholder = 'Excursion title';
  title.required = true;
  title.setAttribute('aria-label', 'Title');

  const eventDate = el('input', 'sign-in__input') as HTMLInputElement;
  eventDate.type = 'date';
  eventDate.required = true;
  eventDate.value = defaultEventDate();
  eventDate.setAttribute('aria-label', 'Event date');

  const group = el('input', 'sign-in__input') as HTMLInputElement;
  group.placeholder = 'Student group (e.g. Year 10 Ethics team)';
  group.setAttribute('aria-label', 'Student group');

  const preview = el('p', 'excursion-preview');
  const refreshPreview = () => {
    const tpl = templatesById.get(templateSelect.value);
    if (!tpl || !eventDate.value) {
      preview.textContent = '';
      return;
    }
    try {
      const plan = buildExcursionPlan(tpl, {
        title: title.value.trim() || tpl.name,
        event_date: eventDate.value,
        student_group_reference: group.value
      });
      preview.textContent = `Will schedule ${plan.admin_tasks.length} tasks · permission ${plan.key_dates.permission_note_due} · risk ${plan.key_dates.risk_assessment_due} · event ${plan.event_date}`;
    } catch {
      preview.textContent = '';
    }
  };
  templateSelect.addEventListener('change', refreshPreview);
  eventDate.addEventListener('change', refreshPreview);
  title.addEventListener('input', refreshPreview);
  refreshPreview();

  const submit = el('button', 'btn btn--primary', 'Review & create');
  submit.type = 'submit';

  form.append(
    el('span', 'chip chip--muted', 'Template'),
    templateSelect,
    title,
    el('span', 'chip chip--muted', 'Event date'),
    eventDate,
    group,
    preview,
    submit
  );

  const confirmHost = el('div', 'excursion-confirm');
  const detailHost = el('div', 'excursion-detail');
  const listHost = el('div', 'task-stack');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const tpl = templatesById.get(templateSelect.value);
    if (!tpl) return;
    const name = title.value.trim();
    if (!name || !eventDate.value) return;
    const plan = buildExcursionPlan(tpl, {
      title: name,
      event_date: eventDate.value,
      student_group_reference: group.value
    });
    showConfirm(
      confirmHost,
      `Create “${name}” (${tpl.name}) on ${plan.event_date}? This will add ${plan.admin_tasks.length} dated admin tasks and draft the permission note + staff email.`,
      async () => {
        const result = await tasksApi.createExcursionFromTemplate({
          excursion_template_id: tpl.id,
          title: name,
          event_date: eventDate.value,
          student_group_reference: group.value.trim() || null
        });
        confirmHost.replaceChildren(
          el('p', 'canvas-status', `Created ${result.project.title} with ${result.tasks.length} tasks.`)
        );
        title.value = '';
        await renderExcursionsView(canvas);
        location.hash = '#/excursions';
      }
    );
  });

  canvas.append(form, confirmHost);

  canvas.append(el('h2', 'section-title', 'Active excursions'));
  if (!excursions.length) {
    listHost.append(
      el('p', 'empty-state', 'No excursions yet. Ethics Olympiad and Da Vinci Decathlon templates are ready above.')
    );
  } else {
    for (const project of excursions) {
      listHost.append(
        renderExcursionCard(project, tasks, templatesById, () => {
          renderDetail(detailHost, project, tasks, templatesById.get(project.competition_or_event_type ?? ''));
        })
      );
    }
  }
  canvas.append(listHost, detailHost);

  if (excursions[0]) {
    renderDetail(
      detailHost,
      excursions[0],
      tasks,
      templatesById.get(excursions[0].competition_or_event_type ?? '')
    );
  }
}
