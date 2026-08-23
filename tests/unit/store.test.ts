import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as keys from '@/storage/keys';
import { createTasksStore, seedIfEmpty, type KvAdapter } from '@/services/store';
import type { SeedData } from '@/services/types';
import {
  adaptiveTodayTasks,
  backlogTasks,
  preferredDomains,
  searchEntities,
  sortByPriorityThenDue
} from '@/domain/queries';
import type { Task } from '@/schemas/task';
import { createBlock } from '@/blocks/create-block';

function memoryKv(): KvAdapter {
  const map = new Map<string, unknown>();
  return {
    async getJSON<T>(key: string) {
      return (map.has(key) ? map.get(key) : null) as T | null;
    },
    async setJSON(key: string, value: unknown) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    }
  };
}

const seed = JSON.parse(
  readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')
) as SeedData;

describe('tasks store', () => {
  it('seeds and supports CRUD through the shared service', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);

    const tasks = await store.listTasks();
    expect(tasks.length).toBeGreaterThan(0);

    const created = await store.createTask({
      title: 'Unit test task',
      domain: 'teaching',
      priority: 'urgent'
    });
    expect(created.id).toMatch(/^task_/);

    const updated = await store.updateTask(created.id, { status: 'done' });
    expect(updated.status).toBe('done');
    expect(updated.completed_at).toBeTruthy();

    await store.deleteTask(created.id, { agent: 'Clare DeMind', reason: 'test cleanup' });
    expect(await store.getTask(created.id)).toBeNull();
  });

  it('persists page_blocks on tasks and projects', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const heading = createBlock('heading', 'block_h1');
    if (heading.block_type !== 'heading') throw new Error('expected heading');
    heading.content.text = 'Brief';
    const created = await store.createTask({
      title: 'Page task',
      domain: 'teaching',
      page_blocks: [heading]
    });
    expect(created.page_blocks?.[0]?.content).toEqual({ text: 'Brief' });

    const rich = createBlock('rich_text', 'block_rt');
    if (rich.block_type !== 'rich_text') throw new Error('expected rich_text');
    rich.content.html = '<p>Notes</p>';
    const updated = await store.updateTask(created.id, {
      page_blocks: [rich]
    });
    expect(updated.page_blocks?.[0]?.block_type).toBe('rich_text');

    const project = (await store.listProjects())[0]!;
    const quote = createBlock('quote', 'block_q');
    if (quote.block_type !== 'quote') throw new Error('expected quote');
    quote.content.quote = 'Hold the line';
    quote.content.attribution = 'Adam';
    const next = await store.updateProject(project.id, {
      page_blocks: [quote]
    });
    expect(next.page_blocks?.[0]?.content).toMatchObject({ quote: 'Hold the line' });
  });

  it('saves and instantiates task templates', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const fromTemplate = await store.createTaskFromTemplate('tt_marking_batch');
    expect(fromTemplate.domain).toBe('teaching');
    expect(fromTemplate.framework_used).toBe('fw_timeboxing');
  });

  it('seeds the competitions catalogue when programs are omitted from seed.json', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    expect((await store.listPrograms()).length).toBe(290);
  });
});

describe('queries', () => {
  it('prefers teaching domains on weekdays', () => {
    const monday = new Date('2026-08-17T12:00:00');
    expect(preferredDomains(monday)).toContain('teaching');
    const saturday = new Date('2026-08-15T12:00:00');
    expect(preferredDomains(saturday)).toContain('wedding');
  });

  it('sorts by priority', () => {
    const tasks = [
      { priority: 'low' },
      { priority: 'urgent' },
      { priority: 'medium' }
    ] as Task[];
    expect(sortByPriorityThenDue(tasks).map((t) => t.priority)).toEqual([
      'urgent',
      'medium',
      'low'
    ]);
  });

  it('finds backlog and search hits', () => {
    const tasks = seed.tasks;
    expect(backlogTasks(tasks).some((t) => t.id === 'task_demo_backlog')).toBe(true);
    const hits = searchEntities(tasks, seed.projects, 'MindWorks');
    expect(hits.projects[0]?.id).toBe('proj_mindworks');
  });

  it('adaptive today includes due tasks', () => {
    const day = new Date('2026-08-17T12:00:00');
    const list = adaptiveTodayTasks(seed.tasks, day);
    expect(list.some((t) => t.id === 'task_demo_lesson_pack')).toBe(true);
  });

  it('creates a project from the standard term template', async () => {
    const kv = memoryKv();
    await seedIfEmpty(kv, keys, seed);
    const store = createTasksStore(kv, keys);
    const project = await store.createProjectFromTemplate('pt_standard_term');
    expect(project.title).toBe('Standard term project');
    expect(project.milestones.map((m) => m.title)).toEqual([
      'Kickoff',
      'Midpoint check',
      'Close'
    ]);
  });
});
