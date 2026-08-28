import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectPageHash, taskPageHash } from '@/domain/cards';
import { upcomingExcursionDates } from '@/domain/dashboard-overview';
import {
  adaptiveTodayTasks,
  overdueTasks,
  preferredDomains
} from '@/domain/queries';
import { findStallCandidates } from '@/domain/stall';
import {
  buildProjectPulseCard,
  findPortfolioTension,
  LIFECYCLE_LABEL,
  projectLifecycleMix,
  runningProjectCount,
  type ProjectLifecycle
} from '@/domain/projects-pulse';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderPressureStrips } from '@/views/pinch-strip';
import { renderProjectPortfolioChart } from '@/views/project-portfolio-chart';
import { el } from '@/views/hub-kit';

export type DashboardOverviewOptions = {
  tasks: Task[];
  projects: Project[];
  now?: Date;
  onChanged?: () => void;
};

const OVERVIEW_OPEN_KEY = 'tasks-hub:dashboard-overview-open';
const MOBILE_OVERVIEW_QUERY = '(max-width: 720px)';

let tensionDismissed = false;

function isMobileOverview(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_OVERVIEW_QUERY).matches;
}

function readOverviewOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = sessionStorage.getItem(OVERVIEW_OPEN_KEY);
  if (stored !== null) return stored === 'true';
  return true;
}

function writeOverviewOpen(open: boolean): void {
  sessionStorage.setItem(OVERVIEW_OPEN_KEY, open ? 'true' : 'false');
}

function viewLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'btn btn--ghost dashboard-overview__link';
  link.href = href;
  link.textContent = label;
  return link;
}

function renderTensionBanner(message: string, onDismiss: () => void): HTMLElement {
  const banner = el('div', 'pulse-banner dashboard-overview__banner');
  banner.setAttribute('role', 'status');
  const icon = el('span', 'pulse-banner__icon');
  icon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2 20h20z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>';
  banner.append(icon, el('span', 'pulse-banner__text', message));
  const dismiss = el('button', 'pulse-banner__dismiss');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Dismiss');
  dismiss.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  dismiss.addEventListener('click', onDismiss);
  banner.append(dismiss);
  return banner;
}

function renderTodayCard(tasks: Task[], now: Date): HTMLElement {
  const card = el('section', 'hub-card dashboard-overview__tile');
  card.setAttribute('aria-label', 'Today');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'Today'));
  head.append(viewLink('#/day', 'Open Today'));
  card.append(head);

  const overdue = overdueTasks(tasks, now);
  if (overdue.length) {
    card.append(
      el(
        'p',
        'dashboard-overview__alert',
        `${overdue.length} overdue — clear these first or defer with Clare.`
      )
    );
  }

  const todayTasks = adaptiveTodayTasks(tasks, now).slice(0, 5);
  if (!todayTasks.length) {
    card.append(
      el(
        'p',
        'empty-state empty-state--compact',
        overdue.length ? 'Nothing else due today.' : 'Nothing due today in your focus domains.'
      )
    );
    return card;
  }

  const list = el('ul', 'dashboard-overview__list');
  for (const task of todayTasks) {
    const item = el('li');
    const link = document.createElement('a');
    link.className = 'dashboard-overview__item';
    link.href = taskPageHash(task.id);
    link.append(
      el('span', 'dashboard-overview__item-title', task.title),
      el('span', `chip chip--muted dashboard-overview__chip`, task.domain)
    );
    item.append(link);
    list.append(item);
  }
  card.append(list);
  return card;
}

function renderProjectsCard(projects: Project[], tasks: Task[], now: Date): HTMLElement {
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const mix = projectLifecycleMix(projects, tasks, stallIds, now);
  const running = runningProjectCount(mix);
  const cards = projects
    .filter((p) => p.status !== 'archived_dead')
    .map((p) => buildProjectPulseCard(p, tasks, stallIds, now))
    .filter((c) => c.lifecycle !== 'completed')
    .sort((a, b) => {
      const order: ProjectLifecycle[] = [
        'needs_attention',
        'on_the_go',
        'planning',
        'stalled',
        'not_started'
      ];
      return order.indexOf(a.lifecycle) - order.indexOf(b.lifecycle);
    })
    .slice(0, 4);

  const card = el('section', 'hub-card dashboard-overview__tile');
  card.setAttribute('aria-label', 'Projects');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'Projects'));
  head.append(viewLink('#/projects', 'Open Projects'));
  card.append(head);

  const portfolio = el('div', 'dashboard-overview__portfolio');
  portfolio.append(renderProjectPortfolioChart(mix, { running, compact: true, href: '#/projects' }));
  card.append(portfolio);

  if (!cards.length) {
    card.append(el('p', 'empty-state empty-state--compact', 'No live projects yet.'));
    return card;
  }

  const list = el('ul', 'dashboard-overview__list');
  for (const pulse of cards) {
    const item = el('li');
    const link = document.createElement('a');
    link.className = 'dashboard-overview__item';
    link.href = projectPageHash(pulse.project.id);
    link.append(
      el('span', 'dashboard-overview__item-title', pulse.project.title),
      el('span', 'chip chip--muted dashboard-overview__chip', LIFECYCLE_LABEL[pulse.lifecycle])
    );
    item.append(link);
    list.append(item);
  }
  card.append(list);
  return card;
}

function renderExcursionsCard(projects: Project[], now: Date): HTMLElement {
  const upcoming = upcomingExcursionDates(projects, now).slice(0, 5);
  const active = projects.filter(
    (p) => p.type === 'excursion' && p.status !== 'archived_dead'
  ).length;

  const card = el('section', 'hub-card dashboard-overview__tile');
  card.setAttribute('aria-label', 'Excursions');
  const head = el('div', 'dashboard-overview__head');
  head.append(el('p', 'hub-card__eyebrow', 'Excursions'));
  head.append(viewLink('#/excursions', 'Open Excursions'));
  card.append(head);

  card.append(
    el(
      'p',
      'dashboard-overview__stat',
      active ? `${active} active excursion${active === 1 ? '' : 's'}.` : 'No active excursions.'
    )
  );

  if (!upcoming.length) {
    card.append(
      el('p', 'empty-state empty-state--compact', 'No admin key dates in the next 90 days.')
    );
    return card;
  }

  const list = el('ul', 'dashboard-overview__list');
  for (const item of upcoming) {
    const row = el('li');
    const link = document.createElement('a');
    link.className = 'dashboard-overview__item';
    link.href = projectPageHash(item.project.id);
    const when =
      item.daysOut === 0
        ? 'Today'
        : item.daysOut === 1
          ? 'Tomorrow'
          : formatDisplayDate(item.due_date);
    link.append(
      el('span', 'dashboard-overview__item-title', `${item.label} · ${item.project.title}`),
      el('span', 'chip chip--muted dashboard-overview__chip', when)
    );
    row.append(link);
    list.append(row);
  }
  card.append(list);
  return card;
}

function overviewPeek(options: DashboardOverviewOptions, now: Date): string {
  const { tasks, projects } = options;
  const overdue = overdueTasks(tasks, now).length;
  const today = adaptiveTodayTasks(tasks, now).length;
  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const running = runningProjectCount(projectLifecycleMix(projects, tasks, stallIds, now));
  const excursions = projects.filter((p) => p.type === 'excursion' && p.status !== 'archived_dead').length;
  const parts = [
    overdue ? `${overdue} overdue` : null,
    today ? `${today} due today` : null,
    running ? `${running} running` : null,
    excursions ? `${excursions} excursion${excursions === 1 ? '' : 's'}` : null
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'All clear for now';
}

function setOverviewOpen(root: HTMLElement, open: boolean): void {
  root.dataset.open = open ? 'true' : 'false';
  const toggle = root.querySelector<HTMLButtonElement>('.dashboard-overview__toggle');
  const panel = root.querySelector<HTMLElement>('.dashboard-overview__panel');
  const peek = root.querySelector<HTMLElement>('.dashboard-overview__peek');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (panel) panel.hidden = !open;
  if (peek) peek.hidden = open;
}

/** Overview band for the home dashboard — today, projects, excursions, pressure. */
export function renderDashboardOverview(host: HTMLElement, options: DashboardOverviewOptions): void {
  const now = options.now ?? new Date();
  const { tasks, projects, onChanged } = options;
  host.replaceChildren();
  host.className = 'dashboard-overview';

  const open = readOverviewOpen();
  host.dataset.open = open ? 'true' : 'false';

  const prefs = preferredDomains(now);
  const shell = el('div', 'dashboard-overview__shell');
  const toggle = el('button', 'dashboard-overview__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'dashboard-overview-panel');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.append(
    el('span', 'dashboard-overview__toggle-label', 'Overview'),
    el('span', 'dashboard-overview__toggle-icon', '▾')
  );
  toggle.addEventListener('click', () => {
    const next = host.dataset.open !== 'true';
    writeOverviewOpen(next);
    setOverviewOpen(host, next);
  });

  const mq = window.matchMedia(MOBILE_OVERVIEW_QUERY);
  const syncViewport = (): void => setOverviewOpen(host, readOverviewOpen());
  mq.addEventListener('change', syncViewport);

  const peek = el('p', 'dashboard-overview__peek', overviewPeek(options, now));
  peek.hidden = open;

  shell.append(
    toggle,
    el(
      'p',
      'view-lede dashboard-overview__lede',
      `Focus: ${prefs.join(', ')} · ${formatDisplayDate(now)}`
    ),
    peek
  );
  host.append(shell);

  const panel = el('div', 'dashboard-overview__panel');
  panel.id = 'dashboard-overview-panel';
  panel.hidden = !open;

  const stallIds = new Set(findStallCandidates(projects, tasks, now).map((c) => c.project.id));
  const pulseCards = projects
    .filter((p) => p.status !== 'archived_dead')
    .map((p) => buildProjectPulseCard(p, tasks, stallIds, now));
  const tension = tensionDismissed ? null : findPortfolioTension(pulseCards, tasks, now);
  if (tension) {
    panel.append(
      renderTensionBanner(tension.message, () => {
        tensionDismissed = true;
        renderDashboardOverview(host, options);
      })
    );
  }

  const grid = el('div', 'dashboard-overview__grid');
  grid.append(
    renderTodayCard(tasks, now),
    renderProjectsCard(projects, tasks, now),
    renderExcursionsCard(projects, now)
  );
  panel.append(grid);

  const pressure = el('div', 'dashboard-overview__pressure');
  renderPressureStrips(pressure, tasks, now, () => onChanged?.());
  panel.append(pressure);

  host.append(panel);
}
