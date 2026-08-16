export interface HubShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  canvas: HTMLElement;
  pageHeader: HTMLElement;
  headerActions: HTMLElement;
  logoutButton: HTMLButtonElement | null;
}

export interface HubShellOptions {
  onLogout?: () => void | Promise<void>;
}

export type HubViewId =
  | 'board'
  | 'graph'
  | 'gantt'
  | 'day'
  | 'week'
  | 'month'
  | 'list'
  | 'search'
  | 'templates'
  | 'projects';

/** Labeled Teaching-style rail — Board is home per design-kit/TASKS.md */
const NAV: Array<{ id: HubViewId; label: string; href: string; glyph: string }> = [
  { id: 'board', label: 'Board', href: '#/board', glyph: '▦' },
  { id: 'graph', label: 'Graph', href: '#/graph', glyph: '◈' },
  { id: 'gantt', label: 'Gantt', href: '#/gantt', glyph: '▤' },
  { id: 'day', label: 'Today', href: '#/day', glyph: '◉' },
  { id: 'week', label: 'Week', href: '#/week', glyph: '▥' },
  { id: 'month', label: 'Month', href: '#/month', glyph: '▣' },
  { id: 'list', label: 'Backlog', href: '#/list', glyph: '☰' },
  { id: 'projects', label: 'Projects', href: '#/projects', glyph: '◇' },
  { id: 'templates', label: 'Templates', href: '#/templates', glyph: '▦' },
  { id: 'search', label: 'Search', href: '#/search', glyph: '⌕' }
];

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${targetId}`;
  a.textContent = 'Skip to content';
  return a;
}

/** Shell from design-kit/snippets/shell.html — Tasks brand + labeled rail. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Tasks navigation');

  const top = document.createElement('div');
  top.className = 'hub-rail__top';

  const brand = document.createElement('p');
  brand.className = 'hub-rail__brand';
  brand.textContent = 'Tasks Hub';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'hub-rail__logout';
    logoutButton.textContent = 'Sign out';
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });
    top.append(brand, logoutButton);
  } else {
    top.append(brand);
  }

  const railNav = document.createElement('div');
  railNav.className = 'hub-rail__nav';
  rail.append(top, railNav);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'hub-canvas';
  canvasWrap.id = 'hub-main';

  const pageHeader = document.createElement('header');
  pageHeader.className = 'page-header';

  const headerActions = document.createElement('div');
  headerActions.className = 'page-header__actions';

  const canvas = document.createElement('div');
  canvas.className = 'hub-canvas__body';

  canvasWrap.append(pageHeader, canvas);
  layout.append(rail, canvasWrap);
  root.append(createSkipLink('hub-main'), layout);

  return { root, rail, railNav, canvas, pageHeader, headerActions, logoutButton };
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

export interface PageHeaderConfig {
  eyebrow: string;
  title: string;
  supporting?: string;
  actions?: HTMLElement | null;
}

/** Kit page header: uppercase eyebrow → h1 → optional supporting → actions. */
export function renderPageHeader(refs: HubShellRefs, config: PageHeaderConfig): void {
  refs.pageHeader.replaceChildren();
  const copy = document.createElement('div');
  copy.className = 'page-header__copy';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'page-header__eyebrow';
  eyebrow.textContent = config.eyebrow;

  const title = document.createElement('h1');
  title.className = 'page-header__title';
  title.textContent = config.title;

  copy.append(eyebrow, title);
  if (config.supporting) {
    const supporting = document.createElement('p');
    supporting.className = 'page-header__supporting';
    supporting.textContent = config.supporting;
    copy.append(supporting);
  }

  refs.pageHeader.append(copy);
  if (config.actions) {
    refs.headerActions.replaceChildren();
    refs.headerActions.append(config.actions);
    refs.pageHeader.append(refs.headerActions);
  }
}

export function parseHashRoute(): HubViewId {
  const hash = location.hash.replace(/^#\/?/, '') || 'board';
  const id = hash.split(/[/?]/)[0] as HubViewId;
  const known: HubViewId[] = [
    'board',
    'graph',
    'gantt',
    'day',
    'week',
    'month',
    'list',
    'search',
    'templates',
    'projects'
  ];
  return known.includes(id) ? id : 'board';
}
