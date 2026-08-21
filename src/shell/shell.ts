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
  | 'maps'
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
const NAV: Array<{ id: HubViewId; label: string; href: string }> = [
  { id: 'board', label: 'Board', href: '#/board' }, { id: 'clare', label: 'Clare', href: '#/clare' }, { id: 'graph', label: 'Graph', href: '#/graph' }, { id: 'maps', label: 'Maps', href: '#/maps' }, { id: 'gantt', label: 'Gantt', href: '#/gantt' }, { id: 'orbit', label: 'Orbit', href: '#/orbit' }, { id: 'branch', label: 'Branch', href: '#/branch' }, { id: 'constellation', label: 'Sky', href: '#/constellation' }, { id: 'day', label: 'Today', href: '#/day' }, { id: 'week', label: 'Week', href: '#/week' }, { id: 'month', label: 'Month', href: '#/month' }, { id: 'list', label: 'Backlog', href: '#/list' }, { id: 'projects', label: 'Projects', href: '#/projects' }, { id: 'excursions', label: 'Excursions', href: '#/excursions' }, { id: 'stress', label: 'Network', href: '#/stress' }, { id: 'corey', label: 'Corey', href: '#/corey' }, { id: 'templates', label: 'Templates', href: '#/templates' }, { id: 'search', label: 'Search', href: '#/search' }
];

function railIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('hub-rail__icon'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.75'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M4 5h16v14H4zM8 9h8M8 13h6'); svg.append(path); return svg;
}

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
  top.className = 'hub-rail__brand-block';

  const brand = document.createElement('a');
  brand.className = 'hub-rail__brand';
  brand.href = '#/board';
  brand.textContent = 'Tasks Hub';

  let logoutButton: HTMLButtonElement | null = null;
  if (options.onLogout) {
    logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'hub-icon-btn';
    logoutButton.setAttribute('aria-label', 'Sign out');
    logoutButton.title = 'Sign out';
    logoutButton.addEventListener('click', () => {
      if (!logoutButton) return;
      logoutButton.disabled = true;
      void Promise.resolve(options.onLogout?.()).finally(() => {
        if (logoutButton) logoutButton.disabled = false;
      });
    });
    top.append(brand);
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

  const utilities = document.createElement('div'); utilities.className = 'hub-utilities';
  if (logoutButton) utilities.append(logoutButton);
  const mark = document.createElement('img'); mark.className = 'hub-mark'; mark.src = 'design-kit/icons/tasks.svg'; mark.alt = ''; mark.width = 32; mark.height = 32;
  headerActions.append(utilities, mark);
  pageHeader.append(headerActions);
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
    link.className = 'primary-nav__link hub-rail__link';
    link.href = item.href;
    if (item.id === active) link.setAttribute('aria-current', 'page');
    link.append(railIcon(), document.createTextNode(item.label));
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
  refs.headerActions.replaceChildren();
  if (config.actions) refs.headerActions.append(config.actions);
  const utilities = document.createElement('div');
  utilities.className = 'hub-utilities';
  if (refs.logoutButton) utilities.append(refs.logoutButton);
  const mark = document.createElement('img');
  mark.className = 'hub-mark';
  mark.src = 'design-kit/icons/tasks.svg';
  mark.alt = '';
  mark.width = 32;
  mark.height = 32;
  refs.headerActions.append(utilities, mark);
  refs.pageHeader.append(refs.headerActions);
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
