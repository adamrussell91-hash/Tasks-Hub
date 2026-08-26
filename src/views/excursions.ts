import type { Project } from '@/schemas/project';
import type { Program } from '@/schemas/program';
import type { ExcursionTemplate } from '@/schemas/templates';
import { tasksApi } from '@/services/client-api';
import {
  buildExcursionPlan,
  formatExcursionPreview,
  resolveExcursionTemplate,
  suggestExcursionTemplate,
  withSchoolExcursionTemplate
} from '@/domain/excursion';
import { projectPageHash } from '@/domain/cards';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { addDays, toDateKey } from '@/domain/queries';
import { hashQuery } from '@/shell/shell';
import { deleteProjectWithTasks } from '@/views/card-actions';
import { requestToggleDone } from '@/views/dashboard';
import { showConfirmWrite } from '@/views/feedback';
import { renderQuickAdd } from '@/views/task-editor';
import { mountProjectCard } from '@/views/hub-cards';
import {
  createHubField,
  createHubFilter,
  createHubSearch,
  el,
  labeledField
} from '@/views/hub-kit';

function defaultEventDate(): string {
  return toDateKey(addDays(new Date(), 45));
}

function openProjectPage(project: Project): void {
  location.hash = projectPageHash(project.id);
}

function filterPrograms(programs: Program[], query: string): Program[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return programs.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, 8);
}

function mountCreateCard(
  host: HTMLElement,
  templates: ExcursionTemplate[],
  programs: Program[],
  confirmHost: HTMLElement
): void {
  const templatesById = new Map(templates.map((item) => [item.id, item]));
  const prefillId = hashQuery().get('template');
  const prefillTpl = resolveExcursionTemplate(prefillId, templates);

  const card = el('form', 'hub-card excursion-create');
  const head = el('header', 'task-card__head');
  head.append(el('span', 'hub-card__eyebrow', 'New'), el('span', 'hub-chip', 'Excursion'));
  card.append(head, el('h2', 'hub-card__title', 'Create excursion'));

  const fields = el('div', 'excursion-create__fields');

  const hits = el('div', 'excursion-create__hits');
  hits.hidden = true;
  hits.setAttribute('role', 'listbox');
  hits.setAttribute('aria-label', 'Matching programs');

  const program = createHubSearch({
    type: 'search',
    placeholder: 'Search the programs catalogue…',
    ariaLabel: 'Program',
    onInput: (value) => {
      hits.replaceChildren();
      const matches = filterPrograms(programs, value);
      if (!matches.length) {
        hits.hidden = true;
        return;
      }
      hits.hidden = false;
      for (const item of matches) {
        const opt = el('button', 'hub-menu__opt', item.name) as HTMLButtonElement;
        opt.type = 'button';
        opt.setAttribute('role', 'option');
        opt.addEventListener('click', () => {
          title.input.value = item.name;
          const suggested = suggestExcursionTemplate(item.name, templates);
          templateSelect.setValue(suggested.id);
          hits.hidden = true;
          program.input.value = item.name;
          refreshPreview();
        });
        hits.append(opt);
      }
    }
  });
  const programField = labeledField('Program', program.el);
  programField.append(hits);

  const templateSelect = createHubFilter({
    key: 'Admin',
    label: 'Admin profile',
    defaultValue: prefillTpl.id,
    options: templates.map((item) => ({ value: item.id, label: item.name })),
    value: prefillTpl.id,
    onChange: () => refreshPreview()
  });

  const title = createHubSearch({
    type: 'text',
    placeholder: 'Excursion title',
    ariaLabel: 'Title',
    required: true,
    value: prefillId ? prefillTpl.name : '',
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
    placeholder: 'Year 10 Ethics team'
  });

  const preview = el('p', 'excursion-preview');
  const refreshPreview = () => {
    const tpl = templatesById.get(templateSelect.getValue()) ?? resolveExcursionTemplate(
      templateSelect.getValue(),
      templates
    );
    if (!eventDate.input.value) {
      preview.textContent = '';
      return;
    }
    try {
      const plan = buildExcursionPlan(tpl, {
        title: title.input.value.trim() || tpl.name,
        event_date: eventDate.input.value,
        student_group_reference: group.input.value
      });
      preview.textContent = formatExcursionPreview(plan.admin_tasks.length, plan.event_date);
    } catch {
      preview.textContent = '';
    }
  };
  refreshPreview();

  const row = el('div', 'excursion-create__row');
  row.append(
    labeledField('Event date', eventDate.el),
    labeledField('Student group', group.el)
  );

  fields.append(
    programField,
    labeledField('Title', title.el),
    row,
    labeledField('Admin profile', templateSelect.el),
    preview
  );

  const actions = el('div', 'excursion-create__actions');
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => {
    confirmHost.replaceChildren();
    host.replaceChildren();
  });
  const submit = el('button', 'btn btn--primary', 'Review & create');
  submit.type = 'submit';
  actions.append(cancel, submit);
  card.append(fields, actions);

  card.addEventListener('submit', (event) => {
    event.preventDefault();
    const tpl = templatesById.get(templateSelect.getValue()) ?? resolveExcursionTemplate(
      templateSelect.getValue(),
      templates
    );
    const name = title.input.value.trim();
    if (!name || !eventDate.input.value) return;
    const plan = buildExcursionPlan(tpl, {
      title: name,
      event_date: eventDate.input.value,
      student_group_reference: group.input.value
    });
    showConfirmWrite(
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

  card.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !programField.contains(next)) hits.hidden = true;
  });

  host.replaceChildren(card);
  title.input.focus();
}

/** Dedicated excursions module — create from a program, then open as a page. */
export async function renderExcursionsView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading excursions…'));
  const [projects, tasks, templatesPayload, programs] = await Promise.all([
    tasksApi.listProjects(),
    tasksApi.listTasks(),
    tasksApi.listTemplates(),
    tasksApi.listPrograms().catch(() => [] as Program[])
  ]);
  const templates = withSchoolExcursionTemplate(templatesPayload.excursion_templates as ExcursionTemplate[]);
  const excursions = projects.filter((item) => item.type === 'excursion');
  const startOpen = Boolean(hashQuery().get('template'));

  canvas.replaceChildren();

  const toolbar = el('div', 'excursion-toolbar');
  const createHost = el('div', 'excursion-create-host');
  const confirmHost = el('div', 'excursion-confirm');
  const listHost = el('div', 'task-stack');

  const openCreate = () => mountCreateCard(createHost, templates, programs, confirmHost);
  const add = el('button', 'btn btn--primary', 'New excursion');
  add.type = 'button';
  add.addEventListener('click', openCreate);
  toolbar.append(add);

  const reload = async () => {
    await renderExcursionsView(canvas);
  };

  if (!excursions.length) {
    listHost.append(el('p', 'empty-state', 'No excursions yet. New excursion picks from the programs catalogue.'));
  } else {
    for (const project of excursions) {
      mountProjectCard(listHost, project, tasks, {
        onToggleChild: (task) => requestToggleDone(confirmHost, task, reload),
        onAddTask: () => {
          confirmHost.replaceChildren(renderQuickAdd(() => void reload(), project.id));
        },
        onOpenPage: openProjectPage,
        onActivate: openProjectPage,
        onDelete: () => {
          const childCount = tasks.filter((task) => task.parent_project_id === project.id).length;
          showConfirmWrite(
            confirmHost,
            `Delete “${project.title}”?`,
            `This removes the excursion and its ${childCount} task${childCount === 1 ? '' : 's'}.`,
            async () => {
              await deleteProjectWithTasks(project, tasks);
              await reload();
            },
            'Delete'
          );
        }
      });
    }
  }

  canvas.append(toolbar, createHost, confirmHost, listHost);
  if (startOpen) openCreate();
}
