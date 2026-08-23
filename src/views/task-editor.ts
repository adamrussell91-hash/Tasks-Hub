import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { formatTagsInput, parseTagsInput, stepsForTask } from '@/domain/hierarchy';

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
      await tasksApi.updateTask(task.id, {
        title: nextTitle,
        due_date: due.value || null,
        domain: domain.value,
        priority: priority.value,
        parent_project_id: project.value || null,
        description: notes.value.trim(),
        tags: parseTagsInput(tags.value)
      });
      await onSaved();
    } catch (err) {
      save.disabled = false;
      discard.disabled = false;
      host.append(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, save);
  card.append(title, due, domain, priority, project, tags, notes, actions);
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
