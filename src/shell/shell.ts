import { railIconFor, refreshIcon, signOutIcon } from '@/shell/icons';

export interface HubShellRefs {
  root: HTMLElement;
  rail: HTMLElement;
  railNav: HTMLElement;
  canvas: HTMLElement;
  reminderHost: HTMLElement;
  pageHeader: HTMLElement;
  headerActions: HTMLElement;
  logoutButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
}

export interface HubShellOptions {
  onLogout?: () => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

export type HubViewId =
  | 'board'
  | 'goals'
  | 'someday'
  | 'clare'
  | 'graph'
  | 'maps'
  | 'gantt'
  | 'orbit'
  | 'universe'
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
  | 'programs'
  | 'stress'
  | 'corey';

type NavItem = { id: HubViewId; label: string; href: string };

const NAV_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  { title: 'Home', items: [{ id: 'board', label: 'Board', href: '#/board' }] },
  {
    title: 'Plan',
    items: [
      { id: 'goals', label: 'Goals', href: '#/goals' },
      { id: 'someday', label: 'Someday', href: '#/someday' },
      { id: 'clare', label: 'Clare', href: '#/clare' },
      { id: 'templates', label: 'Templates', href: '#/templates' }
    ]
  },
  {
    title: 'Views',
    items: [
      { id: 'day', label: 'Today', href: '#/day' },
      { id: 'week', label: 'Week', href: '#/week' },
      { id: 'month', label: 'Month', href: '#/month' },
      { id: 'list', label: 'Backlog', href: '#/list' },
      { id: 'graph', label: 'Graph', href: '#/graph' },
      { id: 'gantt', label: 'Gantt', href: '#/gantt' }
    ]
  },
  {
    title: 'Work',
    items: [
      { id: 'projects', label: 'Projects', href: '#/projects' },
      { id: 'excursions', label: 'Excursions', href: '#/excursions' },
      { id: 'programs', label: 'Programs', href: '#/programs' }
    ]
  },
  {
    title: 'Network',
    items: [
      { id: 'stress', label: 'Network', href: '#/stress' },
      { id: 'corey', label: 'Corey', href: '#/corey' }
    ]
  },
  {
    title: 'Tools',
    items: [
      { id: 'maps', label: 'Maps', href: '#/maps' },
      { id: 'search', label: 'Search', href: '#/search' }
    ]
  }
];

const STRETCH_VIEWS: HubViewId[] = ['orbit', 'universe', 'branch', 'constellation'];

const NAV: NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  { id: 'orbit', label: 'Orbit', href: '#/orbit' },
  { id: 'universe', label: 'Universe', href: '#/universe' },
  { id: 'branch', label: 'Branch', href: '#/branch' },
  { id: 'constellation', label: 'Sky', href: '#/constellation' }
];

export function railHighlightId(view: HubViewId): HubViewId {
  return STRETCH_VIEWS.includes(view) ? 'graph' : view;
}

function iconButton(
  label: string,
  icon: SVGSVGElement,
  onClick: () => void | Promise<void>
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hub-icon-btn';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon);
  button.addEventListener('click', () => {
    button.disabled = true;
    void Promise.resolve(onClick()).finally(() => {
      button.disabled = false;
    });
  });
  return button;
}

export function createSkipLink(targetId: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = `#${targetId}`;
  a.textContent = 'Skip to content';
  a.addEventListener('click', (event) => {
    event.preventDefault();
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLElement)) return;
    target.tabIndex = -1;
    target.focus();
  });
  return a;
}

function mountUtilities(refs: HubShellRefs): HTMLElement {
  const utilities = document.createElement('div');
  utilities.className = 'hub-utilities';
  if (refs.refreshButton) utilities.append(refs.refreshButton);
  if (refs.logoutButton) utilities.append(refs.logoutButton);
  return utilities;
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
  top.append(brand);

  const logoutButton = options.onLogout
    ? iconButton('Sign out', signOutIcon(), () => options.onLogout?.())
    : null;
  const refreshButton = options.onRefresh
    ? iconButton('Refresh', refreshIcon(), () => options.onRefresh?.())
    : null;

  const railNav = document.createElement('div');
  railNav.className = 'hub-rail__nav';
  rail.append(top, railNav);

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'hub-canvas';
  canvasWrap.id = 'hub-main';
  canvasWrap.tabIndex = -1;

  const pageHeader = document.createElement('header');
  pageHeader.className = 'page-header';

  const headerActions = document.createElement('div');
  headerActions.className = 'page-header__actions';

  const canvas = document.createElement('div');
  canvas.className = 'hub-canvas__body';

  const reminderHost = document.createElement('div');
  reminderHost.className = 'reminder-strip-host';
  reminderHost.hidden = true;

  const refs: HubShellRefs = {
    root,
    rail,
    railNav,
    canvas,
    reminderHost,
    pageHeader,
    headerActions,
    logoutButton,
    refreshButton
  };

  headerActions.append(mountUtilities(refs));
  pageHeader.append(headerActions);
  canvasWrap.append(pageHeader, reminderHost, canvas);
  layout.append(rail, canvasWrap);
  root.append(createSkipLink('hub-main'), layout);

  return refs;
}

export function renderPrimaryNav(railNav: HTMLElement, active: HubViewId): void {
  railNav.replaceChildren();
  const nav = document.createElement('nav');
  nav.className = 'hub-rail__list';
  nav.setAttribute('aria-label', 'Primary');
  const highlight = railHighlightId(active);

  for (const section of NAV_SECTIONS) {
    const heading = document.createElement('p');
    heading.className = 'hub-rail__section';
    heading.textContent = section.title;
    nav.append(heading);
    for (const item of section.items) {
      const link = document.createElement('a');
      link.className = 'hub-rail__link';
      link.href = item.href;
      if (item.id === highlight) link.setAttribute('aria-current', 'page');
      link.append(railIconFor(item.id), document.createTextNode(item.label));
      nav.append(link);
    }
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
  refs.headerActions.append(mountUtilities(refs));
  refs.pageHeader.append(refs.headerActions);
}

const KNOWN_VIEWS: HubViewId[] = NAV.map((item) => item.id);

export function knownHubViews(): readonly HubViewId[] {
  return KNOWN_VIEWS;
}

export function hashViewId(hash = location.hash): string {
  return hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'board';
}

export function hashQuery(): URLSearchParams {
  const query = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query);
}

/** Full task/project page: `#/task/:id` or `#/project/:id` — not rail destinations. */
export function parseEntityPage(hash = location.hash): { kind: 'task' | 'project'; id: string } | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/');
  if ((parts[0] === 'task' || parts[0] === 'project') && parts[1]) {
    return { kind: parts[0], id: decodeURIComponent(parts[1]) };
  }
  return null;
}

export function isKnownHashView(hash = location.hash): boolean {
  const id = hashViewId(hash);
  if (id === 'capacity') return true;
  if (parseEntityPage(hash)) return true;
  return KNOWN_VIEWS.includes(id as HubViewId);
}

export function parseHashRoute(): HubViewId {
  const id = hashViewId() as HubViewId;
  return KNOWN_VIEWS.includes(id) ? id : 'board';
}

/** Public Corey share: `#/capacity/<token>` */
export function parseCapacityShareToken(): string | null {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  if (parts[0] === 'capacity' && parts[1]) return parts[1];
  return null;
}
