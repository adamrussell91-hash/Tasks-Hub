import { describe, expect, it } from 'vitest';
import { hashViewId, isKnownHashView, knownHubViews, parseHashRoute } from '@/shell/shell';

describe('hash routes', () => {
  it('includes Maps in the known rail views', () => {
    expect(knownHubViews()).toContain('maps');
  });

  it('includes Programs in the known rail views', () => {
    expect(knownHubViews()).toContain('programs');
  });

  it('resolves #/programs to the programs view', () => {
    location.hash = '#/programs';
    expect(hashViewId()).toBe('programs');
    expect(isKnownHashView()).toBe(true);
    expect(parseHashRoute()).toBe('programs');
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
});
