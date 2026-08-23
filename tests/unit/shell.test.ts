import { describe, expect, it, vi } from 'vitest';
import {
  hashQuery,
  parseHashRoute,
  railHighlightId,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav
} from '../../src/shell/shell';

describe('hub shell chrome', () => {
  it('keeps a single uppercase rail brand and no labelled rail logout', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn() });

    const brand = refs.rail.querySelector('.hub-rail__brand');
    expect(brand?.textContent).toBe('Tasks Hub');
    expect(refs.rail.querySelector('.hub-rail__logout')).toBeNull();
    expect(refs.rail.textContent).not.toContain('Sign out');
  });

  it('places refresh and sign-out icons in page-header utilities', () => {
    const root = document.createElement('div');
    const onLogout = vi.fn();
    const onRefresh = vi.fn();
    const refs = renderHubShell(root, { onLogout, onRefresh });

    renderPageHeader(refs, {
      eyebrow: 'Home',
      title: 'Board',
      supporting: 'Everything on your plate, grouped by status.'
    });

    const labels = [...refs.pageHeader.querySelectorAll('.hub-utilities .hub-icon-btn')].map(
      (btn) => btn.getAttribute('aria-label')
    );
    expect(labels).toEqual(['Refresh', 'Sign out']);
    expect(refs.refreshButton?.querySelector('svg')).not.toBeNull();
    expect(refs.logoutButton?.querySelector('svg')).not.toBeNull();
    expect(refs.logoutButton?.textContent?.trim()).toBe('');
    expect(refs.pageHeader.querySelector('.page-header__actions .hub-utilities')).not.toBeNull();

    refs.logoutButton?.click();
    expect(onLogout).toHaveBeenCalledTimes(1);
    refs.refreshButton?.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps utilities last after re-rendering header actions', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
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
    expect(actions.at(-1)).toBe('hub-utilities');
    expect(refs.headerActions.querySelector('.hub-mark')).toBeNull();
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
  });

  it('renders sectioned rail links with a distinct icon per destination', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    renderPrimaryNav(refs.railNav, 'board');

    const sections = [...refs.railNav.querySelectorAll('.hub-rail__section')].map(
      (el) => el.textContent
    );
    expect(sections).toEqual(['Home', 'Plan', 'Views', 'Work', 'Network', 'Tools']);

    const links = [...refs.railNav.querySelectorAll('.hub-rail__link')];
    expect(links.some((link) => link.textContent === 'Orbit')).toBe(false);
    expect(links.some((link) => link.textContent === 'Board')).toBe(true);

    const signatures = links.map((link) =>
      [...link.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? '').join('|')
    );
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures.length).toBeGreaterThan(8);
  });

  it('highlights Graph for Orbit, Universe, Branch, and Sky', () => {
    expect(railHighlightId('orbit')).toBe('graph');
    expect(railHighlightId('universe')).toBe('graph');
    expect(railHighlightId('branch')).toBe('graph');
    expect(railHighlightId('constellation')).toBe('graph');
    expect(railHighlightId('graph')).toBe('graph');
    expect(railHighlightId('board')).toBe('board');
  });

  it('focuses the canvas on skip-link click without changing the hash to a route', () => {
    const root = document.createElement('div');
    document.body.append(root);
    renderHubShell(root, { onLogout: vi.fn(), onRefresh: vi.fn() });
    window.location.hash = '#/board';
    const skip = root.querySelector<HTMLAnchorElement>('.skip-link');
    const main = root.querySelector<HTMLElement>('#hub-main');
    expect(skip?.getAttribute('href')).toBe('#hub-main');
    expect(main?.getAttribute('tabindex')).toBe('-1');

    skip?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(window.location.hash).toBe('#/board');
    expect(document.activeElement).toBe(main);
    root.remove();
  });
});

describe('parseHashRoute', () => {
  it('keeps Maps on Maps instead of falling back to Board', () => {
    location.hash = '#/maps';
    expect(parseHashRoute()).toBe('maps');
  });

  it('falls back to Board for unknown hashes', () => {
    location.hash = '#/nope';
    expect(parseHashRoute()).toBe('board');
  });
});

describe('hashQuery', () => {
  it('reads query params from a view hash', () => {
    window.location.hash = '#/excursions?template=ext_ethics_olympiad';
    expect(hashQuery().get('template')).toBe('ext_ethics_olympiad');
    window.location.hash = '#/graph?mode=workstreams';
    expect(hashQuery().get('mode')).toBe('workstreams');
  });
});
