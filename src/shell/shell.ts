export interface HubShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  main: HTMLElement;
  contextBar: HTMLElement;
  canvas: HTMLElement;
  logoutButton: HTMLButtonElement | null;
}

export interface HubShellOptions {
  onLogout?: () => void | Promise<void>;
}

export type HubViewId = 'day' | 'week' | 'month' | 'list' | 'search' | 'templates' | 'projects';

const NAV: Array<{ id: HubViewId; label: string; href: string; glyph: string }> = [
  { id: 'day', label: 'Today', href: '#/day', glyph: '◉' },
  { id: 'week', label: 'Week', href: '#/week', glyph: '▦' },
  { id: 'month', label: 'Month', href: '#/month', glyph: '▣' },
  { id: 'list', label: 'Backlog', href: '#/list', glyph: '☰' },
  { id: 'projects', label: 'Projects', href: '#/projects', glyph: '◇' },
  { id: 'templates', label: 'Templates', href: '#/templates', glyph: '▤' },
  { id: 'search', label: 'Search', href: '#/search', glyph: '⌕' }
];

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${targetId}`;
  a.textContent = 'Skip to content';
  return a;
}

export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('nav');
  rail.className = 'hub-layout__rail';
  rail.setAttribute('aria-label', 'Tasks navigation');

  const brandRow = document.createElement('div');
  brandRow.className = 'hub-layout__rail-brand-row';

  const brand = document.createElement('p');
  brand.className = 'hub-layout__rail-brand';
  brand.textContent = 'Tasks Hub';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'hub-layout__logout';
    logoutButton.textContent = 'Sign out';
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });
    brandRow.append(brand, logoutButton);
  } else {
    brandRow.append(brand);
  }

  const railNav = document.createElement('div');
  railNav.className = 'hub-layout__rail-nav';

  rail.append(brandRow, railNav);

  const main = document.createElement('div');
  main.className = 'hub-layout__main';
  main.id = 'hub-main';

  const contextBar = document.createElement('div');
  contextBar.className = 'hub-layout__context-bar';

  const canvas = document.createElement('div');
  canvas.className = 'hub-layout__canvas';

  main.append(contextBar, canvas);
  layout.append(rail, main);
  root.append(createSkipLink('hub-main'), layout);

  return { root, rail, railNav, main, contextBar, canvas, logoutButton };
}

export function renderPrimaryNav(railNav: HTMLElement, active: HubViewId): void {
  railNav.replaceChildren();
  const nav = document.createElement('nav');
  nav.className = 'primary-nav';
  nav.setAttribute('aria-label', 'Primary');

  for (const item of NAV) {
    const link = document.createElement('a');
    link.className = 'primary-nav__link';
    link.href = item.href;
    if (item.id === active) link.setAttribute('aria-current', 'page');
    const glyph = document.createElement('span');
    glyph.className = 'primary-nav__glyph';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = item.glyph;
    link.append(glyph, document.createTextNode(` ${item.label}`));
    nav.append(link);
  }
  railNav.append(nav);
}

export function renderContextBar(refs: HubShellRefs, title: string, trailing?: HTMLElement): void {
  refs.contextBar.hidden = false;
  refs.contextBar.replaceChildren();
  const h1 = document.createElement('h1');
  h1.className = 'hub-layout__context-bar-title';
  h1.textContent = title;
  refs.contextBar.append(h1);
  if (trailing) refs.contextBar.append(trailing);
}

export function parseHashRoute(): HubViewId {
  const hash = location.hash.replace(/^#\/?/, '') || 'day';
  const id = hash.split(/[/?]/)[0] as HubViewId;
  const known: HubViewId[] = ['day', 'week', 'month', 'list', 'search', 'templates', 'projects'];
  return known.includes(id) ? id : 'day';
}
