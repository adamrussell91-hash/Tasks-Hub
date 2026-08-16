import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SeedData } from '@/services/types';
import { buildProjectGanttRows, layoutGantt } from '@/domain/gantt';

const seed = JSON.parse(readFileSync(resolve(process.cwd(), 'fixtures/seed.json'), 'utf8')) as SeedData;

describe('gantt layout', () => {
  it('builds rows for MindWorks with dependency edges', () => {
    const project = seed.projects.find((p) => p.id === 'proj_mindworks')!;
    const rows = buildProjectGanttRows(project, seed.tasks);
    expect(rows.some((r) => r.id === 'task_demo_lesson_pack')).toBe(true);
    expect(rows.some((r) => r.id === 'task_demo_publish')).toBe(true);
    expect(rows.some((r) => r.kind === 'milestone')).toBe(true);

    const layout = layoutGantt(rows);
    expect(layout).not.toBeNull();
    expect(layout!.bars.length).toBe(rows.length);
    expect(layout!.edges.some((e) => e.fromId === 'task_demo_lesson_pack' && e.toId === 'task_demo_publish')).toBe(
      true
    );
    expect(layout!.totalWidth).toBeGreaterThan(layout!.labelWidth);
  });

  it('returns null when project has no dated tasks or milestones', () => {
    const project = {
      ...seed.projects[0]!,
      milestones: []
    };
    expect(layoutGantt(buildProjectGanttRows(project, []))).toBeNull();
  });
});

