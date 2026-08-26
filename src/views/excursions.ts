import type { Project } from '@/schemas/project';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import { buildExcursionPlan, formatLeadTimes } from '@/domain/excursion';
import { projectPageHash } from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, toDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { deleteProjectNow } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';
import { mountProjectCard } from '@/views/hub-cards';
import { createHubField, createHubFilter, createHubSearch, el } from '@/views/hub-kit';

function defaultEventDate(): string {
  return toDateKey(addDays(new Date(), 45));
}

function showConfirm(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  card.append(el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`));
  const actions = el('div', 'confirm-card__actions');
  const cancel = el('button', 'btn btn--ghost', 'Discard');
  cancel.type = 'button';
  const ok = el('button', 'btn btn--primary', 'Confirm');
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
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function openProjectPage(project: Project): void {
  location.hash = projectPageHash(project.id);
}

/** Dedicated excursions module — create from template, then open as a project. */
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

  const form = el('form', 'excursion-form');
  form.append(el('h2', 'section-title', 'New excursion'));

  const prefillId = hashQuery().get('template');

  const prefillTpl = templates.find((t) => t.id === prefillId);
  const templateSelect = createHubFilter({
    key: 'Template',
    label: 'Excursion template',
    defaultValue: prefillId ?? templates[0]?.id ?? '',
    options: templates.map((t) => ({ value: t.id, label: t.name })),
    value: prefillId ?? templates[0]?.id ?? '',
    onChange: () => refreshPreview()
  });

  const title = createHubSearch({
    type: 'text',
    placeholder: 'Excursion title',
    ariaLabel: 'Title',
    required: true,
    value: prefillTpl?.name ?? '',
    onInput: () => refreshPreview()
  });

  const eventDate = createHubField({
    type: 'date',
    ariaLabel: 'Event date',
    required: true,
    value: defaultEventDate(),
    onChange: () => refreshPreview()
  });

  const group = createHubField({
    ariaLabel: 'Student group',
    placeholder: 'Student group (e.g. Year 10 Ethics team)'
  });

  const preview = el('p', 'excursion-preview');
  const refreshPreview = () => {
    const tpl = templatesById.get(templateSelect.getValue());
    if (!tpl || !eventDate.input.value) {
      preview.textContent = '';
      return;
    }
    try {
      const plan = buildExcursionPlan(tpl, {
        title: title.input.value.trim() || tpl.name,
        event_date: eventDate.input.value,
        student_group_reference: group.input.value
      });
      preview.textContent = `Will schedule ${plan.admin_tasks.length} tasks · ${formatLeadTimes(tpl)} · permission ${formatDisplayDate(plan.key_dates.permission_note_due)} · risk ${formatDisplayDate(plan.key_dates.risk_assessment_due)} · event ${formatDisplayDate(plan.event_date)}`;
    } catch {
      preview.textContent = '';
    }
  };
  refreshPreview();

  const submit = el('button', 'btn btn--primary', 'Review & create');
  submit.type = 'submit';

  form.append(templateSelect.el, title.el, eventDate.el, group.el, preview, submit);

  const confirmHost = el('div', 'excursion-confirm');
  const listHost = el('div', 'task-stack');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const tpl = templatesById.get(templateSelect.getValue());
    if (!tpl) return;
    const name = title.input.value.trim();
    if (!name || !eventDate.input.value) return;
    const plan = buildExcursionPlan(tpl, {
      title: name,
      event_date: eventDate.input.value,
      student_group_reference: group.input.value
    });
    showConfirm(
      confirmHost,
      `Create “${name}”`,
      `${tpl.name} on ${formatDisplayDate(plan.event_date)}. This will add ${plan.admin_tasks.length} dated admin tasks and draft the permission note + staff email.`,
      async () => {
        const result = await tasksApi.createExcursionFromTemplate({
          excursion_template_id: tpl.id,
          title: name,
          event_date: eventDate.input.value,
          student_group_reference: group.input.value.trim() || null
        });
        confirmHost.replaceChildren(
          el('p', 'canvas-status', `Created ${result.project.title} with ${result.tasks.length} tasks.`)
        );
        title.input.value = '';
        openProjectPage(result.project);
      }
    );
  });

  canvas.append(form, confirmHost);

  canvas.append(
    el('h2', 'section-title', 'Active excursions'),
    el('p', 'view-lede', 'Excursions are projects. Click a card to open its page.')
  );
  if (!excursions.length) {
    listHost.append(
      el('p', 'empty-state', 'No excursions yet. Ethics Olympiad and Da Vinci Decathlon templates are ready above.')
    );
  } else {
    const reload = async () => {
      await renderExcursionsView(canvas);
    };
    for (const project of excursions) {
      mountProjectCard(listHost, project, tasks, {
        onToggleChild: (task) => requestToggleDone(confirmHost, task, reload),
        onAddTask: () => {
          confirmHost.replaceChildren(renderQuickAdd(() => void reload(), project.id));
        },
        onOpenPage: openProjectPage,
        onActivate: openProjectPage,
        onDelete: (current) => deleteProjectNow(current, reload, confirmHost)
      });
    }
  }
  canvas.append(listHost);
}
