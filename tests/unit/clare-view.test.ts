import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderClareView } from '@/views/clare';
import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareProposal } from '@/domain/clare';
import type { ClareBriefing } from '@/domain/clare-desk';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTemplates: vi.fn(),
    listClareCalibrations: vi.fn(),
    briefWithClare: vi.fn(),
    processDumpWithClare: vi.fn(),
    proposeWithClare: vi.fn(),
    acceptClareProposal: vi.fn(),
    acceptClareBatch: vi.fn()
  }
}));

const frameworks: FrameworkEntry[] = [
  {
    schema_version: 1,
    id: 'fw_timeboxing',
    name: 'Timeboxing',
    best_suited_task_pattern: 'Open-ended work',
    reasoning_template: 'Put a boundary around the work.'
  }
];

const proposal: ClareProposal = {
  title: 'Draft unit overview',
  domain: 'teaching' as const,
  description: '',
  priority: 'medium' as const,
  due_date: null,
  parent_project_id: null,
  framework_id: 'fw_timeboxing',
  framework_name: 'Timeboxing',
  reasoning: 'Start with the smallest concrete move.',
  proposed_minutes: 25,
  suggested_accepted_minutes: 25,
  calibration_note: null,
  protocol_id: 'shrink-first-step'
};

const briefing: ClareBriefing = {
  protocol_id: 'morning-sweep',
  lead: 'One thing before we start: Lock MindWorks term brief was due 22/08/26 and has not moved.',
  closer: 'That is your day. Dump away.',
  sections: [{ heading: 'Overdue', lines: ['Lock MindWorks term brief — was due 22/08/26, urgent.'] }],
  flags: []
};

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value)
  }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('Clare protocol controls', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(tasksApi.listTemplates).mockResolvedValue({
      frameworks,
      excursion_templates: [],
      task_templates: [],
      project_templates: []
    });
    vi.mocked(tasksApi.listClareCalibrations).mockResolvedValue([]);
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue(briefing);
  });

  it('renders five one-sentence hover cards on real protocol controls', async () => {
    const canvas = document.createElement('main');
    await renderClareView(canvas);

    expect(canvas.textContent).toMatch(/clare can/i);
    expect(canvas.textContent).toContain(briefing.closer);
    const pills = [...canvas.querySelectorAll<HTMLButtonElement>('[aria-label="Clare protocols"] [data-protocol-id]')];
    expect(pills).toHaveLength(5);
    for (const pill of pills) {
      expect(pill.title).toBe('');
      const tipId = pill.getAttribute('aria-describedby');
      const tip = tipId ? canvas.querySelector<HTMLElement>(`#${tipId}`) : null;
      expect(tip).not.toBeNull();
      expect(tip?.textContent).toMatch(/^[^.?!]+[.!?]$/);
    }
  });

  it('sends the selected protocol through Clare and rotates wait copy until the result arrives', async () => {
    vi.useFakeTimers();
    const pending = deferred<import('@/domain/clare').ClareDumpResult>();
    vi.mocked(tasksApi.processDumpWithClare).mockReturnValue(pending.promise);
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    const dump = canvas.querySelector<HTMLTextAreaElement>('[aria-label="Brain dump"]')!;
    dump.value = proposal.title;

    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="shrink-first-step"]')!.click();
    await vi.waitFor(() => expect(tasksApi.processDumpWithClare).toHaveBeenCalledTimes(1));
    expect(tasksApi.processDumpWithClare).toHaveBeenCalledWith(
      expect.objectContaining({ protocol_id: 'shrink-first-step', text: proposal.title })
    );
    const first = canvas.querySelector('.canvas-status')?.textContent;
    expect(first).toBeTruthy();
    expect(first).not.toMatch(/thinking|working/i);

    await vi.advanceTimersByTimeAsync(1800);
    const second = canvas.querySelector('.canvas-status')?.textContent;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    pending.resolve({
      voice: 'Right — one thing, and it actually has a shape. Here is my take.',
      proposals: [proposal],
      questions: [],
      notes: [],
      toolkit: null
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).toContain('Right — one thing');
    expect(canvas.textContent).toContain(proposal.title);
    expect(canvas.textContent).not.toContain('Here’s what that protocol means');
    vi.useRealTimers();
  });

  it('runs a sprint briefing when the dump is empty', async () => {
    vi.mocked(tasksApi.briefWithClare).mockResolvedValue({
      ...briefing,
      protocol_id: 'weekly-reset',
      lead: 'Wednesday is the day to protect.',
      closer: 'That is the shape of the week. Dump the rest and I will sort it.'
    });
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    vi.mocked(tasksApi.briefWithClare).mockClear();
    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="weekly-reset"]')!.click();
    await vi.waitFor(() => expect(tasksApi.briefWithClare).toHaveBeenCalledWith('weekly-reset'));
  });
});
