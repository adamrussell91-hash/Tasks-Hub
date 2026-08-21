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

/** First-class rail pages — outline icon + title-case label. Routes unchanged. */
export const RAIL_PAGES: ReadonlyArray<{
  id: HubViewId;
  label: string;
  href: string;
  paths: string[];
}> = [
  { id: 'board', label: 'Board', href: '#/board', paths: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'] },
  { id: 'clare', label: 'Clare', href: '#/clare', paths: ['M12 3l1.6 4.8L18.5 9.5 13.6 11.2 12 16l-1.6-4.8L5.5 9.5l4.9-1.7z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'] },
  { id: 'graph', label: 'Graph', href: '#/graph', paths: ['M7 14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9.2 11.2 14.8 7.8M9.4 13.6 14.7 17.4'] },
  { id: 'gantt', label: 'Gantt', href: '#/gantt', paths: ['M4 6h10M4 12h16M4 18h7'] },
  { id: 'orbit', label: 'Orbit', href: '#/orbit', paths: ['M12 12m-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0', 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0'] },
  { id: 'branch', label: 'Branch', href: '#/branch', paths: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M8.6 8.2A7 7 0 0 0 15 15'] },
  { id: 'constellation', label: 'Sky', href: '#/constellation', paths: ['M12 4l1.2 3.4L16.5 8.5 13.2 9.6 12 13l-1.2-3.4L7.5 8.5l3.3-1.1z', 'M6 15l.7 1.8L8.5 17.5 6.7 18.2 6 20l-.7-1.8L4 17.5l1.8-.7z', 'M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7z'] },
  { id: 'day', label: 'Today', href: '#/day', paths: ['M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01'] },
  { id: 'week', label: 'Week', href: '#/week', paths: ['M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M8 12h8'] },
  { id: 'month', label: 'Month', href: '#/month', paths: ['M8 3v3M16 3v3M4 8h16M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z'] },
  { id: 'list', label: 'Backlog', href: '#/list', paths: ['M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01'] },
  { id: 'projects', label: 'Projects', href: '#/projects', paths: ['M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z'] },
  { id: 'excursions', label: 'Excursions', href: '#/excursions', paths: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'] },
  { id: 'stress', label: 'Network', href: '#/stress', paths: ['M22 12h-4l-3 7-6-14-3 7H2'] },
  { id: 'corey', label: 'Corey', href: '#/corey', paths: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'] },
  { id: 'templates', label: 'Templates', href: '#/templates', paths: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z', 'M16 16h.01M20 16h.01M16 20h.01M20 20h.01'] },
  { id: 'search', label: 'Search', href: '#/search', paths: ['M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M20 20l-3.5-3.5'] }
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

function createRailIcon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('hub-rail__icon');
  for (const d of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Shell from design-kit/snippets/shell.html — brand is the Board home control. */
export function renderHubShell(root: HTMLElement, options: HubShellOptions = {}): HubShellRefs {
  root.replaceChildren();

  const layout = document.createElement('div');
  layout.className = 'hub-layout';

  const rail = document.createElement('aside');
  rail.className = 'hub-rail';
  rail.setAttribute('aria-label', 'Tasks navigation');

  const brandBlock = document.createElement('div');
  brandBlock.className = 'hub-rail__brand-block';

  const brand = document.createElement('a');
  brand.className = 'hub-rail__brand';
  brand.href = '#/board';
  brand.dataset.home = '';
  brand.setAttribute('aria-label', 'Tasks Hub home');
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
  nav.className = 'hub-rail__pages';
  nav.setAttribute('aria-label', 'Primary');

  for (const item of RAIL_PAGES) {
    const link = document.createElement('a');
    link.className = 'hub-rail__link';
    link.href = item.href;
    if (item.id === active) link.setAttribute('aria-current', 'page');
    const label = document.createElement('span');
    label.className = 'hub-rail__label';
    label.textContent = item.label;
    link.append(createRailIcon(item.paths), label);
    nav.append(link);
  }
  railNav.append(nav);

  const brand = railNav.closest('.hub-rail')?.querySelector<HTMLElement>('.hub-rail__brand');
  if (brand) {
    if (active === 'board') brand.setAttribute('aria-current', 'page');
    else brand.removeAttribute('aria-current');
  }
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
