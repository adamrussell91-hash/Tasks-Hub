import type { TaskDomain } from '@/schemas/task';
import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';
import type { ClareBriefing } from '@/domain/clare-desk';
import { tasksApi } from '@/services/client-api';
import { preferredDomains } from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { renderLoadError } from '@/views/feedback';
import {
  CLARE_ADHD_PROTOCOLS,
  CLARE_PROTOCOLS,
  CLARE_WAIT_LINES,
  isBriefingProtocol,
  type ClareProtocol,
  type ClareProtocolId
} from '@/domain/clare-protocols';

export { CLARE_ADHD_PROTOCOLS, CLARE_PROTOCOLS, CLARE_WAIT_LINES } from '@/domain/clare-protocols';

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

function protocolButton(protocol: ClareProtocol, onPick: (id: ClareProtocolId) => void): HTMLButtonElement {
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
  button.addEventListener('click', () => onPick(protocol.id));
  return button;
}

function paintBriefing(host: HTMLElement, briefing: ClareBriefing): void {
  host.replaceChildren();
  const card = el('article', 'clare-bubble clare-briefing');
  card.append(el('p', 'page-header__eyebrow', 'Clare'));
  card.append(el('p', 'clare-bubble__reasoning', briefing.lead));
  for (const section of briefing.sections) {
    card.append(el('h3', 'clare-briefing__heading', section.heading));
    const list = el('ul', 'clare-briefing__list');
    for (const line of section.lines) {
      list.append(el('li', undefined, line));
    }
    card.append(list);
  }
  for (const flag of briefing.flags) {
    card.append(el('p', 'clare-bubble__note', flag.text));
  }
  card.append(el('p', 'clare-bubble__reasoning', briefing.closer));
  host.append(card);
}

function collectAccepted(
  host: HTMLElement,
  proposals: ClareProposal[]
): Array<{ proposal: ClareProposal; accepted_minutes: number; framework_id: string }> {
  return proposals.map((proposal, index) => {
    const minutes = host.querySelector<HTMLInputElement>(`[data-clare-minutes="${index}"]`);
    const framework = host.querySelector<HTMLSelectElement>(`[data-clare-framework="${index}"]`);
    return {
      proposal,
      accepted_minutes: Number(minutes?.value) || proposal.proposed_minutes,
      framework_id: framework?.value || proposal.framework_id
    };
  });
}

function paintDumpResult(
  host: HTMLElement,
  confirmHost: HTMLElement,
  result: ClareDumpResult,
  frameworks: FrameworkEntry[],
  onCreated: () => void
): void {
  host.replaceChildren();
  const card = el('article', 'clare-bubble');
  card.append(el('p', 'page-header__eyebrow', 'Clare'));
  card.append(el('p', 'clare-bubble__reasoning', result.voice));

  if (result.toolkit) {
    card.append(el('h3', 'clare-briefing__heading', result.toolkit.title));
    card.append(el('p', 'clare-bubble__reasoning', result.toolkit.body));
    const steps = el('ul', 'clare-briefing__list');
    for (const step of result.toolkit.steps) {
      steps.append(el('li', undefined, step));
    }
    card.append(steps);
  }

  if (result.questions.length) {
    const questions = el('ul', 'clare-questions');
    for (const question of result.questions) {
      questions.append(el('li', undefined, question));
    }
    card.append(questions);
  }

  if (result.notes.length) {
    card.append(
      el('p', 'clare-bubble__note', `Parked: ${result.notes.join(' · ')}`)
    );
  }

  if (!result.proposals.length) {
    host.append(card);
    confirmHost.replaceChildren();
    return;
  }

  result.proposals.forEach((proposal, index) => {
    const row = el('article', 'clare-item');
    row.append(el('h3', 'clare-bubble__title', proposal.title));
    const meta = el('div', 'task-row__meta');
    meta.append(
      el('span', 'chip', proposal.framework_name),
      el('span', 'chip chip--muted', proposal.domain),
      el('span', 'chip chip--muted', proposal.priority)
    );
    if (proposal.dump_kind === 'communication') {
      meta.append(el('span', 'chip chip--muted', 'comms'));
    }
    if (proposal.due_date) {
      meta.append(el('span', 'chip chip--muted', formatDisplayDate(proposal.due_date)));
    }
    row.append(meta);
    if (!skipReasoning()) {
      row.append(el('p', 'clare-bubble__reasoning', proposal.reasoning));
    } else {
      row.append(el('p', 'clare-bubble__reasoning', `Framework: ${proposal.framework_name}`));
    }
    if (proposal.calibration_note) {
      row.append(el('p', 'clare-bubble__note', proposal.calibration_note));
    }
    const estimateRow = el('div', 'clare-estimate');
    estimateRow.append(el('span', 'chip chip--muted', `Clare: ${proposal.proposed_minutes}m`));
    const minutes = el('input', 'hub-search') as HTMLInputElement;
    minutes.type = 'number';
    minutes.min = '5';
    minutes.step = '5';
    minutes.value = String(proposal.suggested_accepted_minutes);
    minutes.dataset.clareMinutes = String(index);
    minutes.setAttribute('aria-label', `Your estimate for ${proposal.title} (minutes)`);
    estimateRow.append(el('span', undefined, 'Your estimate'), minutes, el('span', undefined, 'min'));
    row.append(estimateRow);

    const fwSelect = el('select', 'hub-filter') as HTMLSelectElement;
    fwSelect.setAttribute('aria-label', `Framework for ${proposal.title}`);
    fwSelect.dataset.clareFramework = String(index);
    for (const fw of frameworks) {
      const opt = document.createElement('option');
      opt.value = fw.id;
      opt.textContent = fw.name;
      if (fw.id === proposal.framework_id) opt.selected = true;
      fwSelect.append(opt);
    }
    row.append(el('span', 'chip chip--muted', 'Framework'), fwSelect);
    card.append(row);
  });

  const negotiate = el('button', 'btn btn--secondary', 'Propose write');
  negotiate.type = 'button';
  negotiate.addEventListener('click', () => {
    showConfirm(confirmHost, collectAccepted(host, result.proposals), onCreated);
  });
  card.append(negotiate);
  host.append(card);
}

function showConfirm(
  host: HTMLElement,
  items: Array<{ proposal: ClareProposal; accepted_minutes: number; framework_id: string }>,
  onCreated: () => void
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  const count = items.length;
  card.append(
    el('h2', 'clare-confirm__title', count === 1 ? 'Create task via Clare' : `Create ${count} tasks via Clare`)
  );
  const summary = items
    .map((item) => {
      const delta = item.accepted_minutes - item.proposal.proposed_minutes;
      const deltaText =
        delta === 0
          ? 'matching her estimate'
          : delta > 0
            ? `adding ${delta}m`
            : `trimming ${Math.abs(delta)}m`;
      return `“${item.proposal.title}” · ${item.accepted_minutes}m (${deltaText})`;
    })
    .join(' · ');
  card.append(
    el(
      'p',
      'page-header__supporting',
      `${summary}. Do not apply until Confirm.`
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
      await tasksApi.acceptClareBatch(items);
      host.replaceChildren(
        el(
          'p',
          'canvas-status',
          count === 1
            ? 'Created. Clare logged the negotiation.'
            : `Created ${count}. Clare logged every negotiation.`
        )
      );
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

/** Clare DeMind desk — morning sweep, brain dump, then confirm-card create. */
export async function renderClareView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading Clare…'));
  let templates: Awaited<ReturnType<typeof tasksApi.listTemplates>>;
  let calibrations: Awaited<ReturnType<typeof tasksApi.listClareCalibrations>>;
  let briefing: ClareBriefing | null = null;
  try {
    [templates, calibrations, briefing] = await Promise.all([
      tasksApi.listTemplates(),
      tasksApi.listClareCalibrations().catch(() => []),
      tasksApi.briefWithClare('morning-sweep').catch(() => null)
    ]);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderClareView(canvas), 'Could not load Clare');
    return;
  }
  const frameworks = templates.frameworks as FrameworkEntry[];

  canvas.replaceChildren();

  const briefingHost = el('div', 'clare-briefing-host');
  canvas.append(briefingHost);
  if (briefing) paintBriefing(briefingHost, briefing);

  let selectedProtocolId: ClareProtocolId | undefined;
  const markActive = (id: ClareProtocolId | undefined) => {
    selectedProtocolId = id;
    for (const peer of canvas.querySelectorAll<HTMLButtonElement>('[data-protocol-id]')) {
      const active = peer.dataset.protocolId === id;
      peer.classList.toggle('is-active', active);
      peer.setAttribute('aria-pressed', String(active));
    }
  };

  const runProtocol = (id: ClareProtocolId) => {
    markActive(id);
    if (dump.value.trim()) {
      void submitDump();
      return;
    }
    if (isBriefingProtocol(id)) {
      void loadBriefing(id);
      return;
    }
    dump.focus();
    proposalHost.replaceChildren(
      el('p', 'clare-bubble__note', 'Dump the thing first — I cannot shrink a blank page.')
    );
  };

  const sprintSection = el('section', 'clare-protocols agent-protocol-pills');
  sprintSection.append(el('p', 'page-header__eyebrow', 'Clare can'));
  const sprintTray = el('div', 'hub-pills');
  sprintTray.setAttribute('role', 'group');
  sprintTray.setAttribute('aria-label', 'Clare protocols');
  for (const protocol of CLARE_PROTOCOLS) {
    sprintTray.append(protocolButton(protocol, runProtocol));
  }
  sprintSection.append(sprintTray);
  canvas.append(sprintSection);

  const adhdSection = el('section', 'clare-protocols agent-protocol-pills');
  adhdSection.append(el('p', 'page-header__eyebrow', 'When stuck'));
  const adhdTray = el('div', 'hub-pills');
  adhdTray.setAttribute('role', 'group');
  adhdTray.setAttribute('aria-label', 'Clare ADHD tools');
  for (const protocol of CLARE_ADHD_PROTOCOLS) {
    adhdTray.append(protocolButton(protocol, runProtocol));
  }
  adhdSection.append(adhdTray);
  canvas.append(adhdSection);

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
  const dump = el('textarea', 'clare-dump') as HTMLTextAreaElement;
  dump.placeholder = 'Dump the chaos. One thing, or twelve. I will sort it.';
  dump.setAttribute('aria-label', 'Brain dump');
  dump.rows = 5;

  const domain = el('select', 'hub-filter') as HTMLSelectElement;
  domain.setAttribute('aria-label', 'Default domain');
  domainOptions(domain, preferredDomains()[0] ?? 'teaching');

  const ask = el('button', 'btn btn--primary', 'Ask Clare');
  ask.type = 'submit';
  const tools = el('div', 'clare-form__tools');
  tools.append(domain, ask);
  form.append(dump, tools);
  canvas.append(form);

  const proposalHost = el('div', 'clare-proposal');
  const confirmHost = el('div', 'clare-confirm');
  canvas.append(proposalHost, confirmHost);

  const extras = el('details', 'clare-extras');
  extras.append(el('summary', undefined, 'Framework library and calibration'));
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
  extras.append(library);
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
    extras.append(cal);
  }
  canvas.append(extras);

  const withWait = async <T>(work: () => Promise<T>): Promise<T | undefined> => {
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
      return await work();
    } catch (err) {
      proposalHost.replaceChildren(
        el('p', 'empty-state', err instanceof Error ? err.message : 'Clare could not propose.')
      );
      return undefined;
    } finally {
      window.clearInterval(waitTimer);
      ask.disabled = false;
    }
  };

  const loadBriefing = async (protocolId: ClareProtocolId) => {
    const next = await withWait(() => tasksApi.briefWithClare(protocolId));
    if (!next) return;
    paintBriefing(briefingHost, next);
    proposalHost.replaceChildren();
  };

  const submitDump = async () => {
    const text = dump.value.trim();
    if (!text) {
      if (selectedProtocolId && isBriefingProtocol(selectedProtocolId)) {
        await loadBriefing(selectedProtocolId);
        return;
      }
      await loadBriefing('morning-sweep');
      return;
    }
    const result = await withWait(() =>
      tasksApi.processDumpWithClare({
        text,
        domain: domain.value,
        protocol_id: selectedProtocolId
      })
    );
    if (!result) return;
    paintDumpResult(proposalHost, confirmHost, result, frameworks, () => {
      dump.value = '';
      void renderClareView(canvas);
    });
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitDump();
  });
}
