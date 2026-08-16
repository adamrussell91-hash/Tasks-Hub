import { fetchSession, logout, renderSignIn } from '@/auth/gate';
import {
  parseHashRoute,
  renderContextBar,
  renderHubShell,
  renderPrimaryNav,
  type HubViewId
} from '@/shell/shell';
import { renderBoardView } from '@/views/board';
import { renderGraphView } from '@/views/graph';
import {
  renderDayView,
  renderWeekView,
  renderMonthView,
  renderListView,
  renderSearchView,
  renderTemplatesView,
  renderProjectsView
} from '@/views/dashboard';

const TITLES: Record<HubViewId, string> = {
  board: 'Board',
  graph: 'Graph',
  day: 'Today',
  week: 'Week',
  month: 'Month',
  list: 'Backlog',
  search: 'Search',
  templates: 'Templates',
  projects: 'Projects'
};

async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<void> {
  switch (view) {
    case 'board':
      return renderBoardView(canvas);
    case 'graph':
      return renderGraphView(canvas);
    case 'day':
      return renderDayView(canvas);
    case 'week':
      return renderWeekView(canvas);
    case 'month':
      return renderMonthView(canvas);
    case 'list':
      return renderListView(canvas);
    case 'search':
      return renderSearchView(canvas);
    case 'templates':
      return renderTemplatesView(canvas);
    case 'projects':
      return renderProjectsView(canvas);
  }
}

async function bootApp(root: HTMLElement): Promise<void> {
  const shell = renderHubShell(root, {
    onLogout: async () => {
      await logout();
      await boot(root);
    }
  });

  const paint = async () => {
    const view = parseHashRoute();
    renderPrimaryNav(shell.railNav, view);
    renderContextBar(shell, TITLES[view]);
    await renderActiveView(view, shell.canvas);
  };

  window.addEventListener('hashchange', () => {
    void paint();
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/board';
  await paint();
}

async function boot(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  try {
    const session = await fetchSession();
    if (!session.authenticated) {
      renderSignIn(root, {
        onSuccess: () => {
          void bootApp(root);
        }
      });
      return;
    }
    await bootApp(root);
  } catch {
    renderSignIn(root, {
      onSuccess: () => {
        void bootApp(root);
      }
    });
  }
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  document.documentElement.dataset.hub = 'tasks';
  void boot(app);
}
