import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { projectLifecycleMix } from '@/domain/projects-pulse';
import { upcomingExcursionDates } from '@/domain/dashboard-overview';
import { renderDashboardOverview } from '@/views/dashboard-overview';
import { renderProjectStatusRing } from '@/views/project-status-ring';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1,
    description: '',
    kind: 'task',
    bucket: 'active',
    step_order: 0,
    domain: 'teaching',
    framework_used: null,
    estimated_duration: 30,
    actual_duration: null,
    due_date: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    completed_at: null,
    status: 'open',
    blocked_since: null,
    priority: 'medium',
    parent_project_id: null,
    parent_task_id: null,
    depends_on: [],
    tags: [],
    recurrence_rule: null,
    due_time: null,
    remind_at: null,
    remind_dismissed_at: null,
    attachments: [],
    source: 'manual',
    ...partial
  };
}

function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1,
    description: '',
    arc_summary: '',
    type: 'standard',
    milestones: [],
    status: 'active',
    baseline_end_date: null,
    current_end_date: null,
    review_summary: null,
    stall_flagged_at: null,
    parent_goal_id: null,
    tags: [],
    competition_or_event_type: null,
    key_dates: null,
    student_group_reference: null,
    generated_admin_tasks: [],
    drafted_documents: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...partial
  };
}

describe('upcomingExcursionDates', () => {
  it('returns future excursion key dates sorted by due date', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const projects = [
      project({
        id: 'ex1',
        title: 'Ethics Olympiad',
        type: 'excursion',
        key_dates: {
          permission_note_due: '2026-09-01',
          staff_notification_due: '2026-09-05',
          risk_assessment_due: null,
          payment_due: null
        },
        current_end_date: '2026-10-15'
      })
    ];
    const items = upcomingExcursionDates(projects, now);
    expect(items.map((item) => item.label)).toEqual([
      'Permission note',
      'Staff notification',
      'Event'
    ]);
    expect(items[0]?.daysOut).toBeGreaterThan(0);
  });

  it('skips archived excursions and past dates', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const projects = [
      project({
        id: 'ex_old',
        title: 'Past trip',
        type: 'excursion',
        status: 'archived_dead',
        key_dates: { permission_note_due: '2026-09-01' }
      }),
      project({
        id: 'ex_past',
        title: 'Late note',
        type: 'excursion',
        key_dates: { permission_note_due: '2026-08-01' }
      })
    ];
    expect(upcomingExcursionDates(projects, now)).toEqual([]);
  });
});

describe('renderProjectStatusRing', () => {
  it('renders a compact ring with legend counts', () => {
    const mix = projectLifecycleMix(
      [
        project({ id: 'p1', title: 'Live', status: 'active' }),
        project({ id: 'p2', title: 'Planning', status: 'active', milestones: [] })
      ],
      [],
      new Set(),
      new Date('2026-08-27T12:00:00.000Z')
    );
    const ring = renderProjectStatusRing(mix, { size: 92, compact: true, href: '#/projects' });
    expect(ring.querySelector('.project-status-ring__svg')).not.toBeNull();
    expect(ring.querySelector('a[href="#/projects"]')).not.toBeNull();
    expect(ring.querySelector('.project-status-ring__legend-row')).not.toBeNull();
  });
});

describe('renderDashboardOverview', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(max-width: 720px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders today, projects ring, and excursions tiles', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now,
      tasks: [
        task({ id: 't1', title: 'Mark essays', due_date: '2026-08-27', domain: 'teaching' })
      ],
      projects: [
        project({ id: 'p1', title: 'MindWorks', status: 'active' }),
        project({
          id: 'ex1',
          title: 'Ethics Olympiad',
          type: 'excursion',
          key_dates: { permission_note_due: '2026-09-01' }
        })
      ]
    });

    expect(host.querySelector('.dashboard-overview__lede')?.textContent).toContain('Focus:');
    expect(host.querySelector('[aria-label="Today"]')?.textContent).toContain('Mark essays');
    expect(host.querySelector('[aria-label="Projects"] .project-status-ring')).not.toBeNull();
    expect(host.querySelector('[aria-label="Projects"]')?.textContent).toContain('MindWorks');
    expect(host.querySelector('[aria-label="Excursions"]')?.textContent).toContain('Permission note');
    expect(host.querySelector('.dashboard-overview__pressure')).not.toBeNull();
  });

  it('collapses and expands the overview panel on mobile', () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: '(max-width: 720px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);

    const host = document.createElement('div');
    renderDashboardOverview(host, {
      now: new Date('2026-08-27T12:00:00.000Z'),
      tasks: [task({ id: 't1', title: 'Mark essays' })],
      projects: [project({ id: 'p1', title: 'MindWorks' })]
    });

    const panel = host.querySelector<HTMLElement>('.dashboard-overview__panel');
    const peek = host.querySelector<HTMLElement>('.dashboard-overview__peek');
    expect(host.dataset.open).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(peek?.hidden).toBe(true);

    host.querySelector<HTMLButtonElement>('.dashboard-overview__toggle')?.click();
    expect(host.dataset.open).toBe('false');
    expect(panel?.hidden).toBe(true);
    expect(sessionStorage.getItem('tasks-hub:dashboard-overview-open')).toBe('false');
  });
});
