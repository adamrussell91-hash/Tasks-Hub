import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderClareView } from '@/views/clare';
import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareProposal } from '@/domain/clare';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listTemplates: vi.fn(),
    listClareCalibrations: vi.fn(),
    proposeWithClare: vi.fn(),
    acceptClareProposal: vi.fn()
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
  framework_id: 'fw_timeboxing',
  framework_name: 'Timeboxing',
  reasoning: 'Start with the smallest concrete move.',
  proposed_minutes: 25,
  suggested_accepted_minutes: 25,
  calibration_note: null,
  protocol_id: 'shrink-first-step'
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
  });

  it('renders five one-sentence hover cards on real protocol controls', async () => {
    const canvas = document.createElement('main');
    await renderClareView(canvas);

    expect(canvas.textContent).toMatch(/clare can/i);
    const pills = [...canvas.querySelectorAll<HTMLButtonElement>('[data-protocol-id]')];
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
    const pending = deferred<typeof proposal>();
    vi.mocked(tasksApi.proposeWithClare).mockReturnValue(pending.promise);
    const canvas = document.createElement('main');
    await renderClareView(canvas);
    const title = canvas.querySelector<HTMLInputElement>('[aria-label="Task"]')!;
    title.value = proposal.title;

    canvas.querySelector<HTMLButtonElement>('[data-protocol-id="shrink-first-step"]')!.click();
    await vi.waitFor(() => expect(tasksApi.proposeWithClare).toHaveBeenCalledTimes(1));
    expect(tasksApi.proposeWithClare).toHaveBeenCalledWith(
      expect.objectContaining({ protocol_id: 'shrink-first-step' })
    );
    const first = canvas.querySelector('.canvas-status')?.textContent;
    expect(first).toBeTruthy();
    expect(first).not.toMatch(/thinking|working/i);

    await vi.advanceTimersByTimeAsync(1800);
    const second = canvas.querySelector('.canvas-status')?.textContent;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    pending.resolve(proposal);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    expect(canvas.querySelector('.canvas-status')).toBeNull();
    expect(canvas.textContent).toContain('Clare proposes');
    expect(canvas.textContent).not.toContain('Here’s what that protocol means');
    vi.useRealTimers();
  });
});
