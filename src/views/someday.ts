import type { Task } from '@/schemas/task';
import { tasksApi } from '@/services/client-api';
import { somedayTasks } from '@/domain/hierarchy';
import { errorMessage } from '@/views/feedback';
import { renderQuickAdd } from '@/views/task-editor';

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

function renderSomedayCard(task: Task, onChange: (next: Task | null) => void): HTMLElement {
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
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteProject = el('button', 'btn btn--secondary', 'Promote to project');
  promoteProject.type = 'button';
  promoteProject.addEventListener('click', () => {
    void tasksApi
      .createProject({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const promoteGoal = el('button', 'btn btn--ghost', 'Promote to goal');
  promoteGoal.type = 'button';
  promoteGoal.addEventListener('click', () => {
    void tasksApi
      .createGoal({ title: task.title, description: task.description })
      .then(() => tasksApi.deleteTask(task.id))
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  const trash = el('button', 'btn btn--ghost', 'Remove');
  trash.type = 'button';
  trash.addEventListener('click', () => {
    if (!window.confirm(`Remove “${task.title}”?`)) return;
    void tasksApi
      .deleteTask(task.id)
      .then(() => onChange(null))
      .catch((err) => window.alert(errorMessage(err)));
  });
  actions.append(promoteTask, promoteProject, promoteGoal, trash);
  card.append(actions);
  return card;
}

/** Someday / Maybe holding pen — off the active board until promoted. */
export async function renderSomedayView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading someday ideas…'));
  try {
    let items = somedayTasks(await tasksApi.listTasks());
    const paint = () => {
      paintSomeday(canvas, items, (next) => {
        items = next;
        paint();
      });
    };
    paint();
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load someday items.')));
  }
}

function paintSomeday(
  canvas: HTMLElement,
  items: Task[],
  setItems: (next: Task[]) => void
): void {
  canvas.replaceChildren();

  const hero = el('div', 'someday-hero');
  hero.append(
    el('span', 'someday-hero__icon', '🌈'),
    el('p', 'view-lede', 'Ideas parked over the rainbow — promote when they are ready for a goal, project, or task.')
  );
  canvas.append(hero);

  const addForm = el('form', 'someday-add');
  const title = el('input', 'hub-search') as HTMLInputElement;
  title.placeholder = 'Capture a someday idea';
  title.required = true;
  title.setAttribute('aria-label', 'Someday idea');
  const submit = el('button', 'btn btn--decisive', 'Park it');
  submit.type = 'submit';
  addForm.append(title, submit);
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const created = await tasksApi.createTask({
        title: title.value.trim(),
        domain: 'other',
        bucket: 'someday',
        status: 'deferred'
      });
      title.value = '';
      setItems([created, ...items]);
    } catch (err) {
      canvas.append(el('p', 'empty-state', errorMessage(err)));
    } finally {
      submit.disabled = false;
    }
  });
  canvas.append(addForm);

  if (items.length === 0) {
    canvas.append(el('p', 'empty-state', 'Nothing in Someday / Maybe yet.'));
    return;
  }

  const grid = el('div', 'someday-grid');
  for (const item of items) {
    grid.append(
      renderSomedayCard(item, (next) => {
        setItems(next ? items.map((entry) => (entry.id === next.id ? next : entry)) : items.filter((entry) => entry.id !== item.id));
      })
    );
  }
  canvas.append(grid);
}
