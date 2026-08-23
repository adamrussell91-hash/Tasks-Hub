import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tasksApi } from '@/services/client-api';
import { renderGanttView, resetGanttSession } from '@/views/gantt';
import type { SeedData } from '@/services/types';
import type { Task } from '@/schemas/task';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTasks: vi.fn(),
    listProjects: vi.fn(),
    updateTask: vi.fn(),
    updateProject: vi.fn(),
    createTask: vi.fn()
  }
}));

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

function transfer(taskId: string) {
  const data: Record<string, string> = { 'text/task-id': taskId, 'text/plain': taskId };
  return {
    data,
    getData(type: string) {
      return data[type] ?? '';
    },
    setData(type: string, value: string) {
      data[type] = value;
    },
    effectAllowed: 'move',
    dropEffect: 'move'
  };
}

describe('gantt view', () => {
  beforeEach(() => {
    resetGanttSession();
    vi.mocked(tasksApi.listTasks).mockReset();
    vi.mocked(tasksApi.listProjects).mockReset();
    vi.mocked(tasksApi.updateTask).mockReset();
    vi.mocked(tasksApi.updateProject).mockReset();
    vi.mocked(tasksApi.listTasks).mockResolvedValue(structuredClone(seed.tasks));
    vi.mocked(tasksApi.listProjects).mockResolvedValue(structuredClone(seed.projects));
    vi.mocked(tasksApi.updateTask).mockImplementation(async (id, body) => {
      const found = seed.tasks.find((entry) => entry.id === id)!;
      return { ...found, ...(body as Partial<Task>) };
    });
    vi.mocked(tasksApi.updateProject).mockImplementation(async (id, body) => {
      const found = seed.projects.find((entry) => entry.id === id)!;
      return { ...found, ...(body as object) };
    });
  });

  it('renders scope, zoom, moons, rail, and bars for MindWorks', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);

    expect(canvas.querySelector('[aria-label="Scope"]')).not.toBeNull();
    expect(canvas.querySelector('[aria-label="Zoom"]')).not.toBeNull();
    expect(canvas.textContent).toMatch(/Critical path/);
    expect(canvas.querySelector('.gantt-moons')).not.toBeNull();
    expect(canvas.querySelector('.gantt-planet')).not.toBeNull();
    expect(canvas.querySelector('.gantt-svg')).not.toBeNull();
    expect(canvas.querySelector('[data-item-id="task_demo_lesson_pack"]')).not.toBeNull();
    expect(canvas.querySelector('.gantt-rail__row')).not.toBeNull();
    expect(canvas.querySelector('.gantt-moons [data-task-id]')).not.toBeNull();
  });

  it('links a moon to a project planet on drop', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const florist = seed.tasks.find((task) => task.id === 'task_demo_wedding_vendor')!;
    expect(florist.parent_project_id).toBeNull();

    const planet = canvas.querySelector<HTMLElement>('[data-project-id="proj_mindworks"]')!;
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer('task_demo_wedding_vendor') });
    planet.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith(
        'task_demo_wedding_vendor',
        expect.objectContaining({ parent_project_id: 'proj_mindworks' })
      );
    });
  });

  it('nests a moon under another moon in the tray', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const target = canvas.querySelector<HTMLElement>('.gantt-moons [data-task-id="task_demo_wedding_vendor"]')!;
    const childId = 'task_demo_backlog';
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: transfer(childId) });
    target.dispatchEvent(drop);

    await vi.waitFor(() => {
      expect(tasksApi.updateTask).toHaveBeenCalledWith(
        childId,
        expect.objectContaining({ parent_task_id: target.dataset.taskId })
      );
    });
  });

  it('switches to all-projects and still paints a chart', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const all = [...canvas.querySelectorAll<HTMLButtonElement>('.hub-pills__btn')].find(
      (btn) => btn.textContent === 'All projects'
    );
    all?.click();
    expect(canvas.querySelector('.gantt-svg')).not.toBeNull();
    expect(canvas.querySelector('.gantt-rail__group')).not.toBeNull();
  });

  it('opens a preview card from a rail row', async () => {
    const canvas = document.createElement('main');
    await renderGanttView(canvas);
    const row = [...canvas.querySelectorAll<HTMLElement>('.gantt-rail__row')].find((node) =>
      node.textContent?.includes('Publish Year 12 pack')
    );
    row?.click();
    expect(canvas.querySelector('.graph-preview__title')?.textContent).toMatch(/Publish Year 12 pack/);
    expect(canvas.querySelector('.gantt-side.has-preview')).not.toBeNull();
  });
});
