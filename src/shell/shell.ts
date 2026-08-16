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
  | 'clare'
  | 'graph'
  | 'gantt'
  | 'orbit'
  | 'branch'
  | 'constellation'
  | 'day'
  | 'week'
  | 'month'
  | 'list'
  | 'search'
  | 'templates'
  | 'projects'
  | 'excursions'
  | 'stress'
  | 'corey';

/** Labeled Teaching-style rail — Board is home per design-kit/TASKS.md */
const NAV: Array<{ id: HubViewId; label: string; href: string; glyph: string }> = [
  { id: 'board', label: 'Board', href: '#/board', glyph: '▦' },
  { id: 'clare', label: 'Clare', href: '#/clare', glyph: '✦' },
  { id: 'graph', label: 'Graph', href: '#/graph', glyph: '◈' },
  { id: 'gantt', label: 'Gantt', href: '#/gantt', glyph: '▬' },
  { id: 'orbit', label: 'Orbit', href: '#/orbit', glyph: '◎' },
  { id: 'branch', label: 'Branch', href: '#/branch', glyph: '⎇' },
  { id: 'constellation', label: 'Sky', href: '#/constellation', glyph: '✧' },
  { id: 'day', label: 'Today', href: '#/day', glyph: '◉' },
  { id: 'week', label: 'Week', href: '#/week', glyph: '▤' },
  { id: 'month', label: 'Month', href: '#/month', glyph: '▣' },
  { id: 'list', label: 'Backlog', href: '#/list', glyph: '☰' },
  { id: 'projects', label: 'Projects', href: '#/projects', glyph: '◇' },
  { id: 'excursions', label: 'Excursions', href: '#/excursions', glyph: '⚑' },
  { id: 'stress', label: 'Network', href: '#/stress', glyph: '✶' },
  { id: 'corey', label: 'Corey', href: '#/corey', glyph: '◐' },
  { id: 'templates', label: 'Templates', href: '#/templates', glyph: '▥' },
  { id: 'search', label: 'Search', href: '#/search', glyph: '⌕' }
];

const SIGN_OUT_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" />
  <path d="M15 12H3" />
  <path d="m7 8-4 4 4 4" />
</svg>
`.trim();

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${targetId}`;
  a.textContent = 'Skip to content';
  return a;
}

function createSignOutButton(onLogout: () => void | Promise<void>): HTMLButtonElement {
  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.className = 'hub-icon-btn';
  logoutButton.setAttribute('data-hub-sign-out', '');
  logoutButton.setAttribute('aria-label', 'Sign out');
  logoutButton.title = 'Sign out';
  logoutButton.innerHTML = SIGN_OUT_ICON;
  logoutButton.addEventListener('click', () => {
    logoutButton.disabled = true;
    void Promise.resolve(onLogout()).finally(() => {
      logoutButton.disabled = false;
    });
  });
  return logoutButton;
}

/** Shell from design-kit/snippets/shell.html — Tasks brand + labeled rail. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Tasks navigation');

  const brandBlock = document.createElement('div');
  brandBlock.className = 'hub-rail__brand-block';

  const brand = document.createElement('p');
  brand.className = 'hub-rail__brand';
  brand.textContent = 'Tasks Hub';
  brandBlock.append(brand);

  const railNav = document.createElement('div');
  railNav.className = 'hub-rail__nav';
  rail.append(brandBlock, railNav);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'hub-canvas';
  canvasWrap.id = 'hub-main';

  const pageHeader = document.createElement('header');
  pageHeader.className = 'page-header';

  const headerActions = document.createElement('div');
  headerActions.className = 'page-header__actions';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    const utilities = document.createElement('div');
    utilities.className = 'hub-utilities';
    logoutButton = createSignOutButton(options.onLogout);
    utilities.append(logoutButton);
    headerActions.append(utilities);
  }

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
  const utilities = refs.headerActions.querySelector('.hub-utilities');

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

  refs.headerActions.replaceChildren();
  if (config.actions) refs.headerActions.append(config.actions);
  if (utilities) refs.headerActions.append(utilities);

  if (refs.headerActions.childElementCount > 0) {
    refs.pageHeader.append(refs.headerActions);
  }
}

export function parseHashRoute(): HubViewId {
  const hash = location.hash.replace(/^#\/?/, '') || 'board';
  const id = hash.split(/[/?]/)[0] as HubViewId;
  const known: HubViewId[] = [
    'board',
    'clare',
    'graph',
    'gantt',
    'orbit',
    'branch',
    'constellation',
    'day',
    'week',
    'month',
    'list',
    'search',
    'templates',
    'projects',
    'excursions',
    'stress',
    'corey'
  ];
  return known.includes(id) ? id : 'board';
}

/** Public Corey share: `#/capacity/<token>` */
export function parseCapacityShareToken(): string | null {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  if (parts[0] === 'capacity' && parts[1]) return parts[1];
  return null;
}
