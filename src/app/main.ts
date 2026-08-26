import '../../design-kit/css/tokens.css';
import '../../design-kit/css/overlays.css';
import '../../design-kit/css/chrome.css';
import '../../design-kit/css/rail.css';
import '../../design-kit/css/filters.css';
import '../../design-kit/css/calendar.css';
import '../../design-kit/css/sign-in.css';
import '../styles/hub.css';
import '../styles/views.css';
import '../styles/cards.css';
import '../styles/gantt.css';
import '../styles/lesson-engine.css';
import 'katex/dist/katex.min.css';

import { fetchSession, logout, messageForSignInFailure, renderSignIn } from '@/auth/gate';
import {
  isKnownHashView,
  parseCapacityShareToken,
  parseEntityPage,
  parseHashRoute,
  parseMapItemPage,
  renderHubShell,
  renderPageHeader,
  renderPrimaryNav,
  type HubViewId
} from '@/shell/shell';
import { renderLoadError } from '@/views/feedback';
import { renderBoardView } from '@/views/board';
import { renderGraphView } from '@/views/graph';
import { renderMapsView } from '@/views/maps';
import { renderGanttView } from '@/views/gantt';
import { renderOrbitView } from '@/views/orbit';
import { renderUniverseView } from '@/views/universe';
import { renderBranchView } from '@/views/branch';
import { renderConstellationView } from '@/views/constellation';
import { renderClareView } from '@/views/clare';
import { installClareSession } from '@/chat/clare-session';
import { renderExcursionsView } from '@/views/excursions';
import { renderProgramsView } from '@/views/programs';
import { renderStressView } from '@/views/stress';
import { renderCoreyView, renderPublicCapacityView } from '@/views/corey';
import {
  renderDayView,
  renderListView,
  renderSearchView,
  renderTemplatesView
} from '@/views/dashboard';
import { renderProjectsView } from '@/views/projects';
import { renderWeekView, renderMonthView } from '@/views/calendar';
import { renderPageEditor } from '@/views/page-editor';
import { renderMapItemPage } from '@/views/map-page';
import { renderGoalsView } from '@/views/goals';
import { renderSomedayView } from '@/views/someday';
import { renderReminderStrip } from '@/views/reminder-strip';
import { tasksApi } from '@/services/client-api';
import { mapsOrSeed } from '@/domain/maps';

const HEADERS: Record<HubViewId, { eyebrow: string; title: string; supporting: string }> = {
  board: {
    eyebrow: 'Home',
    title: 'Board',
    supporting: 'Everything on your plate, grouped by status.'
  },
  goals: {
    eyebrow: 'Plan',
    title: 'Goals',
    supporting: 'Area → Goal → Project, with milestones and tasks underneath.'
  },
  someday: {
    eyebrow: 'Plan',
    title: 'Someday / Maybe',
    supporting: 'Ideas parked over the rainbow until you promote them.'
  },
  clare: {
    eyebrow: 'Desk',
    title: 'Clare DeMind',
    supporting: 'Same chat window as Life Hub. Dump the chaos. She sorts it, then you confirm.'
  },
  graph: {
    eyebrow: 'Structure',
    title: 'Graph',
    supporting: 'See what’s blocking what.'
  },
  maps: {
    eyebrow: 'Pathways',
    title: 'Maps',
    supporting: 'Transit diagrams for programs and projects.'
  },
  gantt: {
    eyebrow: 'Project planning',
    title: 'Gantt',
    supporting: 'Same tasks as every other view, plotted on a timeline. Projects sit in lanes.'
  },
  orbit: {
    eyebrow: 'Explore',
    title: 'Orbit',
    supporting: 'Adam at the centre — urgency pulls work closer.'
  },
  universe: {
    eyebrow: 'Explore',
    title: 'Universe',
    supporting: 'Domains as planets, projects as moons — the same solar map as Knowledge Hub.'
  },
  branch: {
    eyebrow: 'Explore',
    title: 'Branch',
    supporting: 'How one project’s tasks link together.'
  },
  constellation: {
    eyebrow: 'Explore',
    title: 'Sky',
    supporting: 'Completions light stars — not a task list.'
  },
  day: {
    eyebrow: 'Focus',
    title: 'Today',
    supporting: 'What needs you now, with pinch and due-soon cues.'
  },
  week: {
    eyebrow: 'Shape',
    title: 'Week',
    supporting: 'Seven-day calendar — drag to move a due date, click a day to add.'
  },
  month: {
    eyebrow: 'Horizon',
    title: 'Month',
    supporting: 'Full month of tasks, milestones, and excursion key dates.'
  },
  list: {
    eyebrow: 'Inbox',
    title: 'Backlog',
    supporting: 'Open tasks with no due date yet.'
  },
  search: {
    eyebrow: 'Find',
    title: 'Search',
    supporting: 'Titles and descriptions across tasks and projects.'
  },
  templates: {
    eyebrow: 'Reuse',
    title: 'Templates',
    supporting: 'Start from a template — you’ll always confirm before anything’s created.'
  },
  projects: {
    eyebrow: 'Work',
    title: 'Projects',
    supporting: 'Portfolio health, cadence, and lifecycle — not just a queue of what to kill.'
  },
  excursions: {
    eyebrow: 'Events',
    title: 'Excursions',
    supporting: 'Spin up admin tasks from Ethics Olympiad / Da Vinci templates.'
  },
  programs: {
    eyebrow: 'Catalogue',
    title: 'Programs',
    supporting: 'Competitions and programs — search, filter, and open a card.'
  },
  stress: {
    eyebrow: 'Network',
    title: 'Network',
    supporting: 'Pressure flags routed to Hammond, Penelope, and Vera.'
  },
  corey: {
    eyebrow: 'Share',
    title: 'Corey',
    supporting: 'Read-only availability — no task titles on the public link.'
  }
};

function renderNotFound(canvas: HTMLElement, hash: string): void {
  canvas.replaceChildren();
  const lede = document.createElement('p');
  lede.className = 'view-lede';
  lede.textContent = `${hash || '#/'} is not a Tasks Hub page.`;
  const home = document.createElement('button');
  home.type = 'button';
  home.className = 'btn btn--primary';
  home.textContent = 'Back to Board';
  home.addEventListener('click', () => {
    location.hash = '#/board';
  });
  canvas.append(lede, home);
}

async function renderActiveView(view: HubViewId, canvas: HTMLElement): Promise<void> {
  switch (view) {
    case 'board':
      return renderBoardView(canvas);
    case 'goals':
      return renderGoalsView(canvas);
    case 'someday':
      return renderSomedayView(canvas);
    case 'clare':
      return renderClareView(canvas);
    case 'graph':
      return renderGraphView(canvas);
    case 'maps':
      return renderMapsView(canvas);
    case 'gantt':
      return renderGanttView(canvas);
    case 'orbit':
      return renderOrbitView(canvas);
    case 'universe':
      return renderUniverseView(canvas);
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
    case 'programs':
      return renderProgramsView(canvas);
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
    },
    onRefresh: () => void paint()
  });
  const clare = installClareSession(root);
  void clare.start();

  async function paint() {
    window.scrollTo(0, 0);
    document.body.classList.remove('is-universe-fullscreen');
    const canvasWrap = shell.canvas.closest('.hub-canvas');
    if (canvasWrap instanceof HTMLElement) canvasWrap.scrollTop = 0;
    shell.canvas.scrollTop = 0;
    clare.park();

    const share = parseCapacityShareToken();
    if (share) {
      await bootPublicCapacity(root, share);
      return;
    }
    const mapItem = parseMapItemPage();
    if (mapItem) {
      const listed = await tasksApi.listMaps().catch(() => []);
      const map = mapsOrSeed(listed).find((entry) => entry.id === mapItem.mapId);
      const named =
        mapItem.kind === 'station'
          ? map?.stations.find((entry) => entry.id === mapItem.id)
          : map?.ticks.find((entry) => entry.id === mapItem.id);
      renderPrimaryNav(shell.railNav, 'maps');
      renderPageHeader(shell, {
        eyebrow: mapItem.kind === 'station' ? 'Program' : 'Competition',
        title: named?.label ?? 'Page',
        supporting: 'A planning card — it stays off the board until you make it active.'
      });
      try {
        await renderMapItemPage(shell.canvas, mapItem);
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint(), 'Could not open card');
      }
      return;
    }
    const entity = parseEntityPage();
    if (entity) {
      let rail: HubViewId = entity.kind === 'project' ? 'projects' : 'board';
      let eyebrow = entity.kind === 'task' ? 'Task' : 'Project';
      let title = 'Page';
      if (entity.kind === 'task') {
        const task = await tasksApi.getTask(entity.id).catch(() => null);
        if (task) title = task.title;
      } else {
        const project = await tasksApi.getProject(entity.id).catch(() => null);
        if (project) {
          title = project.title;
          if (project.type === 'excursion') {
            rail = 'excursions';
            eyebrow = 'Excursion';
          }
        }
      }
      renderPrimaryNav(shell.railNav, rail);
      renderPageHeader(shell, {
        eyebrow,
        title,
        supporting: 'Build the page with Teaching Hub’s lesson blocks.'
      });
      try {
        await renderPageEditor(shell.canvas, entity);
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint(), 'Could not open page');
      }
      return;
    }
    if (!isKnownHashView()) {
      renderPrimaryNav(shell.railNav, 'board');
      renderPageHeader(shell, {
        eyebrow: 'Missing',
        title: 'Page not found',
        supporting: 'That page doesn’t exist.'
      });
      renderNotFound(shell.canvas, location.hash);
      return;
    }
    const view = parseHashRoute();
    renderPrimaryNav(shell.railNav, view);
    renderPageHeader(shell, HEADERS[view]);
    clare.sync(view);
    try {
      await renderReminderStrip(shell.reminderHost, () => void paint());
      await renderActiveView(view, shell.canvas);
    } catch (err) {
      renderLoadError(shell.canvas, err, () => void paint(), `Could not load ${HEADERS[view].title}`);
    }
  }

  window.addEventListener('hashchange', () => {
    void paint();
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
  } catch (err) {
    renderSignIn(root, {
      initialError: messageForSignInFailure(err),
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
