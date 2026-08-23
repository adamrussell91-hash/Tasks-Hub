import type { TaskDomain } from '@/schemas/task';
import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareProposal } from '@/domain/clare';
import { tasksApi } from '@/services/client-api';
import { preferredDomains } from '@/domain/queries';
import { renderLoadError } from '@/views/feedback';
import {
  CLARE_PROTOCOLS,
  CLARE_WAIT_LINES,
  type ClareProtocolId
} from '@/domain/clare-protocols';

export { CLARE_PROTOCOLS, CLARE_WAIT_LINES } from '@/domain/clare-protocols';

const SKIP_REASONING_KEY = 'tasks-hub-clare-skip-reasoning';

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

function skipReasoning(): boolean {
  return localStorage.getItem(SKIP_REASONING_KEY) === '1';
}

function setSkipReasoning(on: boolean): void {
  localStorage.setItem(SKIP_REASONING_KEY, on ? '1' : '0');
}

function domainOptions(select: HTMLSelectElement, preferred: TaskDomain): void {
  select.replaceChildren();
  for (const d of ['teaching', 'life', 'wedding', 'health', 'other'] as const) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    if (d === preferred) opt.selected = true;
    select.append(opt);
  }
}

/** Clare DeMind desk — negotiate estimate + framework, then confirm-card create. */
export async function renderClareView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading Clare…'));
  let templates: Awaited<ReturnType<typeof tasksApi.listTemplates>>;
  let calibrations: Awaited<ReturnType<typeof tasksApi.listClareCalibrations>>;
  try {
    [templates, calibrations] = await Promise.all([
      tasksApi.listTemplates(),
      tasksApi.listClareCalibrations().catch(() => [])
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderClareView(canvas), 'Could not load Clare');
    return;
  }
  const frameworks = templates.frameworks as FrameworkEntry[];

  canvas.replaceChildren();

  let selectedProtocolId: ClareProtocolId | undefined;
  const protocolSection = el('section', 'clare-protocols agent-protocol-pills');
  protocolSection.append(el('p', 'page-header__eyebrow', 'Clare can'));
  const protocolTray = el('div', 'hub-pills');
  protocolTray.setAttribute('role', 'group');
  protocolTray.setAttribute('aria-label', 'Clare protocols');
  for (const protocol of CLARE_PROTOCOLS) {
    const button = el('button', 'hub-pills__btn');
    button.type = 'button';
    button.dataset.protocolId = protocol.id;
    button.setAttribute('aria-pressed', 'false');
    const tipId = `clare-protocol-tip-${protocol.id}`;
    button.setAttribute('aria-describedby', tipId);
    const tip = el('span', 'agent-protocol-pills__tip', protocol.explain);
    tip.id = tipId;
    tip.setAttribute('role', 'tooltip');
    button.append(el('span', 'agent-protocol-pills__label', protocol.label), tip);
    button.addEventListener('click', () => {
      selectedProtocolId = protocol.id;
      for (const peer of protocolTray.querySelectorAll<HTMLButtonElement>('[data-protocol-id]')) {
        const active = peer === button;
        peer.classList.toggle('is-active', active);
        peer.setAttribute('aria-pressed', String(active));
      }
      if (title.value.trim()) form.requestSubmit();
      else title.focus();
    });
    protocolTray.append(button);
  }
  protocolSection.append(protocolTray);
  canvas.append(protocolSection);

  const prefs = el('div', 'clare-prefs');
  const skipLabel = el('label', 'clare-prefs__skip');
  const skip = document.createElement('input');
  skip.type = 'checkbox';
  skip.checked = skipReasoning();
  skip.addEventListener('change', () => setSkipReasoning(skip.checked));
  skipLabel.append(skip, document.createTextNode(' Just show the framework — skip reasoning'));
  prefs.append(skipLabel);
  canvas.append(prefs);

  const form = el('form', 'clare-form');
  const title = el('input', 'hub-search') as HTMLInputElement;
  title.placeholder = 'What needs doing?';
  title.required = true;
  title.setAttribute('aria-label', 'Task');

  const domain = el('select', 'hub-filter') as HTMLSelectElement;
  domain.setAttribute('aria-label', 'Domain');
  domainOptions(domain, preferredDomains()[0] ?? 'teaching');

  const priority = el('select', 'hub-filter') as HTMLSelectElement;
  priority.setAttribute('aria-label', 'Priority');
  for (const p of ['medium', 'high', 'urgent', 'low'] as const) {
    const opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p;
    priority.append(opt);
  }

  const due = el('input', 'hub-search') as HTMLInputElement;
  due.type = 'date';
  due.setAttribute('aria-label', 'Due date');

  const ask = el('button', 'btn btn--primary', 'Ask Clare');
  ask.type = 'submit';
  form.append(title, domain, priority, due, ask);
  canvas.append(form);

  const proposalHost = el('div', 'clare-proposal');
  const confirmHost = el('div', 'clare-confirm');
  canvas.append(proposalHost, confirmHost);

  const library = el('div', 'clare-library');
  library.append(el('h2', 'section-title', 'Framework library'));
  const stack = el('div', 'task-stack');
  for (const fw of frameworks) {
    const row = el('article', 'task-row');
    row.append(
      el('h3', 'task-row__title', fw.name),
      el('p', 'task-row__desc', fw.best_suited_task_pattern),
      el('p', 'task-row__desc', fw.reasoning_template)
    );
    stack.append(row);
  }
  library.append(stack);
  canvas.append(library);

  if (calibrations.length) {
    const cal = el('div', 'clare-calibration');
    cal.append(el('h2', 'section-title', 'Estimate calibration'));
    for (const c of calibrations) {
      const row = el('article', 'task-row');
      const meanAccepted =
        c.sample_count > 0 ? Math.round(c.sum_accepted / c.sample_count) : c.calibrated_default_minutes;
      row.append(
        el('h3', 'task-row__title', c.domain),
        el(
          'p',
          'task-row__desc',
          `${c.sample_count} negotiations · default ~${c.calibrated_default_minutes}m · mean accepted ${meanAccepted}m` +
            (c.actual_sample_count
              ? ` · ${c.actual_sample_count} actuals (mean ${Math.round(c.sum_actual / c.actual_sample_count)}m)`
              : '')
        )
      );
      cal.append(row);
    }
    canvas.append(cal);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    ask.disabled = true;
    let waitIndex = 0;
    const showWaitLine = () => {
      proposalHost.replaceChildren(
        el('p', 'canvas-status', CLARE_WAIT_LINES[waitIndex % CLARE_WAIT_LINES.length])
      );
      waitIndex += 1;
    };
    showWaitLine();
    const waitTimer = window.setInterval(showWaitLine, 1800);
    confirmHost.replaceChildren();
    try {
      const proposal = await tasksApi.proposeWithClare({
        title: text,
        domain: domain.value,
        priority: priority.value,
        due_date: due.value || null,
        protocol_id: selectedProtocolId
      });
      paintProposal(proposalHost, confirmHost, proposal, frameworks, () => {
        title.value = '';
        void renderClareView(canvas);
      });
    } catch (err) {
      proposalHost.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Clare could not propose.')
      );
    } finally {
      window.clearInterval(waitTimer);
      ask.disabled = false;
    }
  });
}

function paintProposal(
  host: HTMLElement,
  confirmHost: HTMLElement,
  proposal: ClareProposal,
  frameworks: FrameworkEntry[],
  onCreated: () => void
): void {
  host.replaceChildren();
  const card = el('article', 'clare-bubble');
  card.append(el('p', 'page-header__eyebrow', 'Clare proposes'));
  card.append(el('h3', 'clare-bubble__title', proposal.title));

  const meta = el('div', 'task-row__meta');
  meta.append(
    el('span', 'chip', proposal.framework_name),
    el('span', 'chip chip--muted', proposal.domain),
    el('span', 'chip chip--muted', proposal.priority)
  );
  card.append(meta);

  if (!skipReasoning()) {
    card.append(el('p', 'clare-bubble__reasoning', proposal.reasoning));
  } else {
    card.append(el('p', 'clare-bubble__reasoning', `Framework: ${proposal.framework_name}`));
  }
  if (proposal.calibration_note) {
    card.append(el('p', 'clare-bubble__note', proposal.calibration_note));
  }

  const estimateRow = el('div', 'clare-estimate');
  estimateRow.append(el('span', 'chip chip--muted', `Clare: ${proposal.proposed_minutes}m`));
  const minutes = el('input', 'hub-search') as HTMLInputElement;
  minutes.type = 'number';
  minutes.min = '5';
  minutes.step = '5';
  minutes.value = String(proposal.suggested_accepted_minutes);
  minutes.setAttribute('aria-label', 'Your estimate (minutes)');
  estimateRow.append(el('span', undefined, 'Your estimate'), minutes, el('span', undefined, 'min'));
  card.append(estimateRow);

  const fwSelect = el('select', 'hub-filter') as HTMLSelectElement;
  fwSelect.setAttribute('aria-label', 'Framework');
  for (const fw of frameworks) {
    const opt = document.createElement('option');
    opt.value = fw.id;
    opt.textContent = fw.name;
    if (fw.id === proposal.framework_id) opt.selected = true;
    fwSelect.append(opt);
  }
  card.append(el('span', 'chip chip--muted', 'Framework'), fwSelect);

  const negotiate = el('button', 'btn btn--secondary', 'Propose write');
  negotiate.type = 'button';
  negotiate.addEventListener('click', () => {
    const accepted = Number(minutes.value) || proposal.proposed_minutes;
    showConfirm(confirmHost, proposal, accepted, fwSelect.value, onCreated);
  });
  card.append(negotiate);
  host.append(card);
}

function showConfirm(
  host: HTMLElement,
  proposal: ClareProposal,
  accepted: number,
  frameworkId: string,
  onCreated: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'clare-confirm__title', 'Create task via Clare'));
  const delta = accepted - proposal.proposed_minutes;
  const deltaText =
    delta === 0
      ? 'matching her estimate'
      : delta > 0
        ? `adding ${delta}m to her estimate`
        : `trimming ${Math.abs(delta)}m from her estimate`;
  card.append(
    el(
      'p',
      'page-header__supporting',
      `“${proposal.title}” · ${accepted}m (${deltaText}) · ${proposal.framework_name}. Do not apply until Confirm.`
    )
  );
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await tasksApi.acceptClareProposal({
        proposal,
        accepted_minutes: accepted,
        framework_id: frameworkId
      });
      host.replaceChildren(el('p', 'canvas-status', 'Created. Clare logged the negotiation.'));
      onCreated();
    } catch (err) {
      host.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Create failed')
      );
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
