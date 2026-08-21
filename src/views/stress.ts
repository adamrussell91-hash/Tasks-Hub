import type { StressFlag } from '@/schemas/stress';
import { tasksApi } from '@/services/client-api';
import { renderLoadError } from '@/views/feedback';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderFlag(flag: StressFlag): HTMLElement {
  const row = el('article', 'stress-card');
  row.append(
    el('p', 'page-header__eyebrow', `${flag.pattern_kind.replace(/_/g, ' ')} · Clare → network`),
    el('p', 'stress-card__body', flag.pattern_description)
  );
  const meta = el('div', 'task-row__meta');
  for (const agent of flag.routed_to) {
    meta.append(el('span', 'chip chip--muted', agent));
  }
  meta.append(el('span', 'chip', flag.created_at.slice(0, 10)));
  row.append(meta);
  if (flag.recurrence_note) {
    row.append(el('p', 'task-row__desc', flag.recurrence_note));
  }
  return row;
}

/** Read-only StressFlag trail — agents poll inboxes; Adam can inspect texture here. */
export async function renderStressView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Scanning pressure patterns…'));
  let scan: { raised: StressFlag[]; skipped: number; patterns: number };
  let flags: StressFlag[];
  let hammond: StressFlag[];
  try {
    scan = await tasksApi.scanStressFlags().catch(() => ({
      raised: [],
      skipped: 0,
      patterns: 0
    }));
    [flags, hammond] = await Promise.all([
      tasksApi.listStressFlags(),
      tasksApi.listAgentInbox('General Hammond')
    ]);
  } catch (err) {
    renderLoadError(
      canvas,
      err,
      () => void renderStressView(canvas),
      'Could not load StressFlags'
    );
    return;
  }

  canvas.replaceChildren();
  canvas.append(
    el(
      'p',
      'view-lede',
      'Clare raises textured StressFlags into agent inboxes (Hammond → Penelope → Vera). Write-on-create only — no sync fan-out yet.'
    )
  );

  const status = el('p', 'stress-scan-status');
  status.textContent =
    scan.raised.length > 0
      ? `Scan raised ${scan.raised.length} new flag(s); ${scan.skipped} already known.`
      : scan.patterns > 0
        ? `Scan found ${scan.patterns} pattern(s); all already routed.`
        : 'No pressure patterns right now.';
  canvas.append(status);

  const rescan = el('button', 'btn btn--secondary', 'Scan again');
  rescan.type = 'button';
  rescan.addEventListener('click', () => void renderStressView(canvas));
  canvas.append(rescan);

  canvas.append(el('h2', 'section-title', 'Open flags'));
  const stack = el('div', 'task-stack');
  if (!flags.length) {
    stack.append(el('p', 'empty-state', 'No StressFlags yet.'));
  } else {
    for (const flag of [...flags].reverse()) {
      stack.append(renderFlag(flag));
    }
  }
  canvas.append(stack);

  canvas.append(el('h2', 'section-title', 'General Hammond inbox'));
  const inbox = el('div', 'task-stack');
  if (!hammond.length) {
    inbox.append(el('p', 'empty-state', 'Inbox empty.'));
  } else {
    for (const flag of [...hammond].reverse().slice(0, 10)) {
      inbox.append(renderFlag(flag));
    }
  }
  canvas.append(inbox);
}
