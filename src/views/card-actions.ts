import type { Task } from '@/schemas/task';
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

/** One-click card delete — no proposed-write banner. */
export function deleteTaskNow(
  task: Task,
  reload: () => void | Promise<void>,
  errorHost: HTMLElement
): void {
  void tasksApi
    .deleteTask(task.id, { agent: 'Tasks Hub', reason: 'Card delete' })
    .then(() => reload())
    .catch((err: unknown) => {
      errorHost.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    });
}

/** Delete a project and every task that belongs to it. */
export async function deleteProjectWithTasks(
  project: Project,
  tasks: Task[],
  meta = { agent: 'Tasks Hub', reason: 'Card delete' }
): Promise<void> {
  const children = tasks.filter((task) => task.parent_project_id === project.id);
  await Promise.all(children.map((task) => tasksApi.deleteTask(task.id, meta)));
  await tasksApi.deleteProject(project.id, meta);
}
