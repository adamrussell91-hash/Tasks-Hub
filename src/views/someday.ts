import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import { errorMessage } from '@/views/feedback';
import {
  createHubFilter,
  createHubSearch,
  createHubToolbar,
  domainFilterOptions,
  el
} from '@/views/hub-kit';
import type { TaskDomain } from '@/schemas/task';

let somedayDomain: TaskDomain | 'all' = 'all';
let somedayQuery = '';

function renderSomedayCard(task: Task, onReload: () => void): HTMLElement {
  const card = el('article', 'glass-tile someday-card');
  card.append(el('h3', 'someday-card__title', task.title));
  if (task.description) card.append(el('p', 'someday-card__copy', task.description));
  const meta = el('p', 'hierarchy-meta', `${task.domain} · ${task.priority}`);
  card.append(meta);

  const actions = el('div', 'someday-card__actions');
  const promoteTask = el('button', 'btn btn--primary', 'Promote to task');
  promoteTask.type = 'button';
  promoteTask.addEventListener('click', () => {
    void tasksApi
      .updateTask(task.id, { bucket: 'active', status: 'open' })
      .then(onReload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteProject = el('button', 'btn btn--secondary', 'Promote to project');
  promoteProject.type = 'button';
  promoteProject.addEventListener('click', () => {
    void tasksApi
      .createProject({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(onReload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteGoal = el('button', 'btn btn--ghost', 'Promote to goal');
  promoteGoal.type = 'button';
  promoteGoal.addEventListener('click', () => {
    void tasksApi
      .createGoal({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(onReload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  const trash = el('button', 'btn btn--ghost', 'Remove');
  trash.type = 'button';
  trash.addEventListener('click', () => {
    if (!window.confirm(`Remove “${task.title}”?`)) return;
    void tasksApi.deleteTask(task.id).then(onReload).catch((err) => window.alert(errorMessage(err)));
  });
  actions.append(promoteTask, promoteProject, promoteGoal, trash);
  card.append(actions);
  return card;
}

/** Someday / Maybe holding pen — off the active board until promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading someday ideas…'));
  try {
    const tasks = await tasksApi.listTasks();
    paintSomeday(canvas, somedayTasks(tasks));
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load someday items.')));
  }
}

function paintSomeday(canvas: HTMLElement, items: Task[]): void {
  const restoreSearch =
    document.activeElement instanceof HTMLInputElement &&
    document.activeElement.getAttribute('aria-label') === 'Filter someday ideas';
  const searchPos = restoreSearch
    ? (document.activeElement as HTMLInputElement).selectionStart
    : null;

  canvas.replaceChildren();
  const reload = () => {
    void renderSomedayView(canvas);
  };

  const hero = el('div', 'someday-hero');
  hero.append(
    el('span', 'someday-hero__icon', '🌈'),
    el('p', 'view-lede', 'Ideas parked over the rainbow — promote when they are ready for a goal, project, or task.')
  );
  canvas.append(hero);

  const filters = createHubToolbar();
  const search = createHubSearch({
    placeholder: 'Filter someday ideas…',
    ariaLabel: 'Filter someday ideas',
    value: somedayQuery,
    onInput: (value) => {
      somedayQuery = value;
      paintSomeday(canvas, items);
    }
  });
  filters.append(
    search.el,
    createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: somedayDomain,
      onChange: (value) => {
        somedayDomain = value as TaskDomain | 'all';
        paintSomeday(canvas, items);
      }
    }).el
  );
  canvas.append(filters);

  const addForm = el('form', 'someday-add hub-toolbar');
  const title = createHubSearch({
    type: 'text',
    placeholder: 'Capture a someday idea',
    ariaLabel: 'Someday idea',
    required: true
  });
  const submit = el('button', 'btn btn--decisive', 'Park it');
  submit.type = 'submit';
  addForm.append(title.el, submit);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await tasksApi.createTask({
        title: title.input.value.trim(),
        domain: 'other',
        bucket: 'someday',
        status: 'deferred'
      });
      title.input.value = '';
      reload();
    } catch (err) {
      canvas.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  canvas.append(addForm);

  const query = somedayQuery.trim().toLowerCase();
  const visible = items.filter((item) => {
    if (somedayDomain !== 'all' && item.domain !== somedayDomain) return false;
    if (
      query &&
      !item.title.toLowerCase().includes(query) &&
      !item.description.toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  if (visible.length === 0) {
    canvas.append(
      el(
        'p',
        'empty-state',
        items.length === 0 ? 'Nothing in Someday / Maybe yet.' : 'No someday ideas match those filters.'
      )
    );
    return;
  }

  const grid = el('div', 'someday-grid');
  for (const item of visible) grid.append(renderSomedayCard(item, reload));
  canvas.append(grid);

  if (restoreSearch) {
    const field = canvas.querySelector<HTMLInputElement>('[aria-label="Filter someday ideas"]');
    if (field) {
      field.focus();
      if (searchPos != null) field.setSelectionRange(searchPos, searchPos);
    }
  }
}
