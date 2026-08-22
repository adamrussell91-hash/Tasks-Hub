import type { Task, TaskDomain, TaskPriority } from '@/schemas/task';
import type { Project } from '@/schemas/project';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';

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

/** Inline edit panel — title, due, domain, project, notes. Replaces missing task detail. */
export function renderTaskEditor(
  host: HTMLElement,
  task: Task,
  projects: Project[],
  onSaved: () => void | Promise<void>
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card task-editor');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Edit task');
  card.append(el('p', 'page-header__eyebrow', 'Edit task'));
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
        description: notes.value.trim()
      });
      await onSaved();
    } catch (err) {
      save.disabled = false;
      discard.disabled = false;
      host.append(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, save);
  card.append(title, due, domain, priority, project, notes, actions);
  host.append(card);
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
        parent_project_id: projectId
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
