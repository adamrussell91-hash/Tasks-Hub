import '../../design-kit/css/tokens.css';
import '../../design-kit/css/overlays.css';
import '../../design-kit/css/chrome.css';
import '../../design-kit/css/rail.css';
import '../../design-kit/css/sign-in.css';
import '../styles/hub.css';
import '../styles/views.css';

import { fetchSession, logout, renderSignIn } from '@/auth/gate';
import {
  parseCapacityShareToken,
  parseHashRoute,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav,
  type HubViewId
} from '@/shell/shell';
import { renderBoardView } from '@/views/board';
import { renderGraphView } from '@/views/graph';
import { renderGanttView } from '@/views/gantt';
import { renderOrbitView } from '@/views/orbit';
import { renderBranchView } from '@/views/branch';
import { renderConstellationView } from '@/views/constellation';
import { renderClareView } from '@/views/clare';
import { renderExcursionsView } from '@/views/excursions';
import { renderStressView } from '@/views/stress';
import { renderCoreyView, renderPublicCapacityView } from '@/views/corey';
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
  clare: {
    eyebrow: 'Negotiate',
    title: 'Clare DeMind',
    supporting: 'Propose duration and framework — confirm before write.'
  },
  graph: {
    eyebrow: 'Structure',
    title: 'Graph',
    supporting: 'Blockers and workstreams — Knowledge-style search, select, preview.'
  },
  gantt: {
    eyebrow: 'Schedule',
    title: 'Gantt',
    supporting: 'Project timeline from due dates and dependencies.'
  },
  orbit: {
    eyebrow: 'Stretch',
    title: 'Orbit',
    supporting: 'Adam at the centre — urgency pulls work closer.'
  },
  branch: {
    eyebrow: 'Stretch',
    title: 'Branch',
    supporting: 'One project’s parent tree and depends_on edges.'
  },
  constellation: {
    eyebrow: 'Stretch',
    title: 'Constellation',
    supporting: 'Completions light stars — a payoff metaphor, not a task list.'
  },
  day: {
    eyebrow: 'Focus',
    title: 'Today',
    supporting: 'Adaptive domain focus, pinch pressure, and due-soon.'
  },
  week: {
    eyebrow: 'Shape',
    title: 'Week',
    supporting: 'Due work with pinch watch / overload cues.'
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
    supporting: 'Stall revive / Frankenstein / bury, or close with planned-vs-actual.'
  },
  excursions: {
    eyebrow: 'Events',
    title: 'Excursions',
    supporting: 'Spin up admin tasks from Ethics Olympiad / Da Vinci templates.'
  },
  stress: {
    eyebrow: 'Network',
    title: 'StressFlags',
    supporting: 'Pattern flags routed to Hammond, Penelope, and Vera inboxes.'
  },
  corey: {
    eyebrow: 'Share',
    title: 'Corey capacity',
    supporting: 'Read-only availability — no task titles on the public link.'
  }
};

async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<void> {
  switch (view) {
    case 'board':
      return renderBoardView(canvas);
    case 'clare':
      return renderClareView(canvas);
    case 'graph':
      return renderGraphView(canvas);
    case 'gantt':
      return renderGanttView(canvas);
    case 'orbit':
      return renderOrbitView(canvas);
    case 'branch':
      return renderBranchView(canvas);
    case 'constellation':
      return renderConstellationView(canvas);
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
    case 'excursions':
      return renderExcursionsView(canvas);
    case 'stress':
      return renderStressView(canvas);
    case 'corey':
      return renderCoreyView(canvas);
  }
}

async function bootPublicCapacity(root: HTMLElement, token: string): Promise<void> {
  root.replaceChildren();
  const shell = renderHubShell(root, {});
  shell.logoutButton?.remove();
  renderPageHeader(shell, {
    eyebrow: 'Shared',
    title: 'Capacity',
    supporting: 'Adam’s rough availability — nothing task-level.'
  });
  await renderPublicCapacityView(shell.canvas, token);
}

async function bootApp(root: HTMLElement): Promise<void> {
  const shell = renderHubShell(root, {
    onLogout: async () => {
      await logout();
      await boot(root);
    }
  });

  const paint = async () => {
    const share = parseCapacityShareToken();
    if (share) {
      await bootPublicCapacity(root, share);
      return;
    }
    const view = parseHashRoute();
    renderPrimaryNav(shell.railNav, view);
    renderPageHeader(shell, HEADERS[view]);
    await renderActiveView(view, shell.canvas);
  };

  window.addEventListener('hashchange', () => {
    void paint();
  });

  shell.rail.querySelector<HTMLElement>('[data-home]')?.addEventListener('click', (event) => {
    event.preventDefault();
    if (location.hash === '#/board') {
      void paint();
      return;
    }
    location.hash = '#/board';
  });

  if (!location.hash || location.hash === '#/') location.hash = '#/board';
  await paint();
}

async function boot(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  const share = parseCapacityShareToken();
  if (share) {
    await bootPublicCapacity(root, share);
    window.addEventListener('hashchange', () => {
      void boot(root);
    });
    return;
  }

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
