import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RAIL_PAGES,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav
} from '../../src/shell/shell';

const here = dirname(fileURLToPath(import.meta.url));
const hubCss = readFileSync(join(here, '../../src/styles/hub.css'), 'utf8');
const mainTs = readFileSync(join(here, '../../src/app/main.ts'), 'utf8');

describe('hub shell chrome', () => {
  it('keeps a single uppercase rail brand and no labelled rail logout', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root, { onLogout: vi.fn() });

    const brand = refs.rail.querySelector('.hub-rail__brand');
    expect(brand?.textContent).toBe('Tasks Hub');
    expect(refs.rail.querySelector('.hub-rail__logout')).toBeNull();
    expect(refs.rail.textContent).not.toContain('Sign out');
  });

  it('makes Tasks Hub a home control to the Board', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);

    const brand = refs.rail.querySelector<HTMLAnchorElement>('.hub-rail__brand');
    expect(brand?.tagName).toBe('A');
    expect(brand?.getAttribute('href')).toBe('#/board');
    expect(brand?.hasAttribute('data-home')).toBe(true);
    expect(brand?.getAttribute('aria-label')).toBe('Tasks Hub home');
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

  it('keeps sign-out utilities after re-rendering header actions', () => {
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
    expect(actions.at(-1)).toBe('hub-utilities');
    expect(refs.logoutButton?.getAttribute('aria-label')).toBe('Sign out');
  });

  it('renders first-class pages as outline icons with title-case labels', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);
    renderPrimaryNav(refs.railNav, 'graph');

    const links = [...refs.railNav.querySelectorAll<HTMLAnchorElement>('.hub-rail__link')];
    expect(links.map((el) => el.getAttribute('href'))).toEqual(RAIL_PAGES.map((p) => p.href));
    expect(links.map((el) => el.querySelector('.hub-rail__label')?.textContent)).toEqual(
      RAIL_PAGES.map((p) => p.label)
    );
    expect(RAIL_PAGES.map((p) => p.label)).toEqual([
      'Board',
      'Clare',
      'Graph',
      'Gantt',
      'Orbit',
      'Branch',
      'Sky',
      'Today',
      'Week',
      'Month',
      'Backlog',
      'Projects',
      'Excursions',
      'Network',
      'Corey',
      'Templates',
      'Search'
    ]);

    for (const link of links) {
      const icon = link.querySelector<SVGSVGElement>('svg.hub-rail__icon');
      expect(icon).not.toBeNull();
      expect(icon?.getAttribute('fill')).toBe('none');
      expect(icon?.getAttribute('stroke')).toBe('currentColor');
      expect(link.querySelector('.nav-dot')).toBeNull();
    }

    expect(refs.railNav.querySelector('[aria-current="page"] .hub-rail__label')?.textContent).toBe(
      'Graph'
    );
    expect(refs.rail.querySelector('.hub-rail__brand')?.getAttribute('aria-current')).toBeNull();
  });

  it('marks the brand current on the Board home route', () => {
    const root = document.createElement('div');
    const refs = renderHubShell(root);
    renderPrimaryNav(refs.railNav, 'board');
    expect(refs.rail.querySelector('.hub-rail__brand')?.getAttribute('aria-current')).toBe('page');
    expect(refs.railNav.querySelector('[aria-current="page"] .hub-rail__label')?.textContent).toBe(
      'Board'
    );
  });

  it('loads rail.css and does not override --rail-width or use an icon column', () => {
    expect(mainTs).toContain("import '../../design-kit/css/rail.css'");
    expect(hubCss).not.toMatch(/--rail-width\s*:/);
    expect(hubCss).not.toContain('nav-dot');
    expect(hubCss).not.toContain('justify-items: center');
  });
});
