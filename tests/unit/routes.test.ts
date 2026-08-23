import { describe, expect, it } from 'vitest';
import {
  hashViewId,
  isKnownHashView,
  knownHubViews,
  parseEntityPage,
  parseHashRoute
} from '@/shell/shell';

describe('hash routes', () => {
  it('includes Maps in the known rail views', () => {
    expect(knownHubViews()).toContain('maps');
  });

  it('includes Universe in the known stretch views', () => {
    expect(knownHubViews()).toContain('universe');
    location.hash = '#/universe';
    expect(hashViewId()).toBe('universe');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('universe');
  });

  it('resolves #/maps to the maps view', () => {
    location.hash = '#/maps';
    expect(hashViewId()).toBe('maps');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('maps');
  });

  it('treats unknown hashes as not-known instead of silently being maps', () => {
    location.hash = '#/definitely-missing';
    expect(isKnownHashView()).toBe(false);
    expect(parseHashRoute()).toBe('board');
  });

  it('recognises task and project page hashes without adding them to the rail', () => {
    location.hash = '#/task/task_lesson';
    expect(parseEntityPage()).toEqual({ kind: 'task', id: 'task_lesson' });
    expect(isKnownHashView()).toBe(true);
    expect(knownHubViews()).not.toContain('task');

    location.hash = '#/project/proj_mindworks';
    expect(parseEntityPage()).toEqual({ kind: 'project', id: 'proj_mindworks' });
    expect(isKnownHashView()).toBe(true);
    expect(knownHubViews()).not.toContain('project');
  });
});
