import { describe, expect, it, vi } from 'vitest';
import { parseHashRoute, renderHubShell, renderPageHeader } from '../../src/shell/shell';

describe('hub shell chrome', () => {
  it('keeps a single uppercase rail brand and no labelled rail logout', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn() });

    const brand = refs.rail.querySelector('.hub-rail__brand');
    expect(brand?.textContent).toBe('Tasks Hub');
    expect(refs.rail.querySelector('.hub-rail__logout')).toBeNull();
    expect(refs.rail.textContent).not.toContain('Sign out');
  });

  it('places a discrete sign-out icon in page-header actions', () => {
    const root = document.createElement('div');
    const onLogout = vi.fn();
    const refs = renderHubShell(root, { onLogout });

    renderPageHeader(refs, {
      eyebrow: 'Home',
      title: 'Board',
      supporting: 'Tasks and projects.'
    });

    const btn = refs.pageHeader.querySelector('.hub-utilities .hub-icon-btn');
    expect(btn).toBe(refs.logoutButton);
    expect(btn?.getAttribute('aria-label')).toBe('Sign out');
    expect(btn?.textContent?.trim()).toBe('');
    expect(refs.pageHeader.querySelector('.page-header__actions .hub-utilities')).not.toBeNull();

    refs.logoutButton?.click();
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps utilities followed by the hub tile after re-rendering header actions', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn() });
    const extra = document.createElement('button');
    extra.type = 'button';
    extra.className = 'btn btn--secondary';
    extra.textContent = 'Secondary';

    renderPageHeader(refs, {
      eyebrow: 'Home',
      title: 'Board',
      actions: extra
    });

    const actions = [...refs.headerActions.children].map((el) => el.className);
    expect(actions[0]).toContain('btn');
    expect(actions.at(-2)).toBe('hub-utilities');
    expect(actions.at(-1)).toBe('hub-mark');
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
  });
});

describe('parseHashRoute', () => {
  it('keeps Maps on Maps instead of falling back to Board', () => {
    location.hash = '#/maps';
    expect(parseHashRoute()).toBe('maps');
  });

  it('recognises other rail destinations', () => {
    location.hash = '#/graph';
    expect(parseHashRoute()).toBe('graph');
    location.hash = '#/stress';
    expect(parseHashRoute()).toBe('stress');
  });

  it('falls back to Board for unknown hashes', () => {
    location.hash = '#/nope';
    expect(parseHashRoute()).toBe('board');
  });
});
