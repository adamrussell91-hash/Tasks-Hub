import type { Project } from '@/schemas/project';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import { buildExcursionPlan } from '@/domain/excursion';
import { newExcursionHash, projectPageHash } from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, toDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { plusIcon } from '@/shell/icons';
import { deleteProjectNow } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { renderQuickAdd } from '@/views/task-editor';
import { mountProjectCard } from '@/views/hub-cards';
import { createHubField, createHubFilter, el } from '@/views/hub-kit';

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

function plusButton(label: string, href: string): HTMLButtonElement {
  const button = el('button', 'icon-plus-btn excursions-add') as HTMLButtonElement;
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(plusIcon());
  button.addEventListener('click', () => {
    location.hash = href;
  });
  return button;
}

/** Dedicated excursions module — list active excursions; create lives on its own page. */
export async function renderExcursionsView(canvas: HTMLElement): Promise<void> {
  const prefillId = hashQuery().get('template');
  if (prefillId) {
    location.hash = newExcursionHash(prefillId);
    return;
  }

  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursions…'));
  const [projects, tasks] = await Promise.all([tasksApi.listProjects(), tasksApi.listTasks()]);
  const excursions = projects.filter((p) => p.type === 'excursion');

  canvas.replaceChildren();
  const confirmHost = el('div', 'excursion-confirm');
  const listHost = el('div', 'task-stack');
  canvas.append(plusButton('New excursion', newExcursionHash()), confirmHost);

  if (!excursions.length) {
    listHost.append(el('p', 'empty-state', 'No excursions yet.'));
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

/** Full-page create — same excursion chrome as `#/project/:id`, then confirm before write. */
export async function renderNewExcursionPage(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursion…'));
  const templatesPayload = await tasksApi.listTemplates();
  const templates = templatesPayload.excursion_templates as ExcursionTemplate[];
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const prefillId = hashQuery().get('template');
  const prefillTpl = templates.find((t) => t.id === prefillId) ?? templates[0];

  const page = el('div', 'excursion-page');
  const nav = el('div', 'page-editor__nav');
  const back = el('button', 'btn btn--ghost', 'Back to Excursions');
  back.type = 'button';
  back.addEventListener('click', () => {
    location.hash = '#/excursions';
  });
  nav.append(back);

  const form = el('form', 'excursion-form excursion-form--page');
  const head = el('header', 'excursion-page__head');
  head.append(el('span', 'hub-card__eyebrow', 'Excursion'));
  const title = el('input', 'hub-card__title page-card__title-input') as HTMLInputElement;
  title.type = 'text';
  title.required = true;
  title.placeholder = 'Title';
  title.setAttribute('aria-label', 'Title');
  title.value = prefillTpl?.name ?? '';

  const fields = el('div', 'page-card__fields hub-toolbar');
  const templateSelect = createHubFilter({
    key: 'Template',
    label: 'Template',
    defaultValue: prefillTpl?.id ?? '',
    options: templates.map((t) => ({ value: t.id, label: t.name })),
    value: prefillTpl?.id ?? '',
    onChange: (value) => {
      const tpl = templatesById.get(value);
      if (tpl && !title.value.trim()) title.value = tpl.name;
    }
  });
  const eventDate = createHubField({
    type: 'date',
    ariaLabel: 'Event date',
    required: true,
    value: defaultEventDate()
  });
  const group = createHubField({
    ariaLabel: 'Student group',
    placeholder: 'Student group'
  });
  fields.append(templateSelect.el, eventDate.el, group.el);

  const submit = el('button', 'btn btn--primary', 'Review & create');
  submit.type = 'submit';
  form.append(head, title, fields, submit);

  const confirmHost = el('div', 'excursion-confirm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const tpl = templatesById.get(templateSelect.getValue());
    if (!tpl) return;
    const name = title.value.trim();
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
        openProjectPage(result.project);
      }
    );
  });

  page.append(nav, form, confirmHost);
  canvas.replaceChildren(page);
}
