import '../../design-kit/css/tokens.css';
import '../../design-kit/css/overlays.css';
import '../../design-kit/css/chrome.css';
import '../../design-kit/css/sign-in.css';
import '../styles/hub.css';
import '../styles/views.css';

import { fetchSession, logout, renderSignIn } from '@/auth/gate';
import {
  parseHashRoute,
  renderHubShell,
  renderPageHeader,
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

const HEADERS: Record<HubViewId, { eyebrow: string; title: string; supporting: string }> = {
  board: {
    eyebrow: 'Home',
    title: 'Board',
    supporting: 'Tasks and projects as Teaching-density tiles.'
  },
  graph: {
    eyebrow: 'Structure',
    title: 'Graph',
    supporting: 'Blockers and workstreams — Knowledge-style search, select, preview.'
  },
  day: {
    eyebrow: 'Focus',
    title: 'Today',
    supporting: 'Adaptive domain focus for this weekday.'
  },
  week: {
    eyebrow: 'Shape',
    title: 'Week',
    supporting: 'Due work across the working week.'
  },
  month: {
    eyebrow: 'Horizon',
    title: 'Month',
    supporting: 'Milestones and excursion key dates.'
  },
  list: {
    eyebrow: 'Inbox',
    title: 'Backlog',
    supporting: 'Open tasks without a due date.'
  },
  search: {
    eyebrow: 'Find',
    title: 'Search',
    supporting: 'Titles and descriptions across tasks and projects.'
  },
  templates: {
    eyebrow: 'Reuse',
    title: 'Templates',
    supporting: 'Start from a template or grow the library from real work.'
  },
  projects: {
    eyebrow: 'Arcs',
    title: 'Projects',
    supporting: 'Programs, excursions, and standard projects.'
  }
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
    renderPageHeader(shell, HEADERS[view]);
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
