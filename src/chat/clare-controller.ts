import type { FrameworkEntry } from '@/schemas/templates';
import type { ClareDumpResult, ClareProposal } from '@/domain/clare';
import { briefingToMarkdown, toolkitToMarkdown, type ClareBriefing } from '@/domain/clare-desk';
import { isBriefingProtocol, type ClareProtocolId } from '@/domain/clare-protocols';
import { networkBriefing } from '@/domain/network-desk';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { createHubField, createHubFilter } from '@/views/hub-kit';
import { tasksApi } from '@/services/client-api';
import { agentBySlug, DEFAULT_AGENT_SLUG, type ChatAgentSlug } from '@/chat/agents';
import { paintProtocolTrays } from '@/chat/build-chat-view';
import {
  applyAgentAccent,
  renderAgentPicker
} from '@/chat/render-agent-picker';
import {
  appendMessage,
  appendSavedCard,
  setChatBusy,
  setChatUnread,
  setConfirmBusy,
  showChatError
} from '@/chat/render-chat';

const SKIP_REASONING_KEY = 'tasks-hub-clare-skip-reasoning';

export function skipReasoning(): boolean {
  return localStorage.getItem(SKIP_REASONING_KEY) === '1';
}

export function setSkipReasoning(on: boolean): void {
  localStorage.setItem(SKIP_REASONING_KEY, on ? '1' : '0');
}

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

function markActive(root: ParentNode, id: string | undefined): void {
  for (const peer of root.querySelectorAll<HTMLButtonElement>('[data-protocol-id]')) {
    const active = peer.dataset.protocolId === id;
    peer.classList.toggle('is-active', active);
    peer.setAttribute('aria-pressed', String(active));
  }
}

function syncComposer(root: ParentNode, slug: ChatAgentSlug): void {
  const agent = agentBySlug(slug);
  const input = root.querySelector<HTMLTextAreaElement>('#chat-input');
  if (input) input.placeholder = agent.placeholder;
  const domain = root.querySelector<HTMLElement>('#chat-domain');
  if (domain) domain.hidden = slug !== 'clare';
  const prefs = document.querySelector<HTMLElement>('.clare-prefs');
  if (prefs) prefs.hidden = slug !== 'clare';
}

function collapseHero(root: ParentNode, collapsed: boolean): void {
  const hero = root.querySelector<HTMLElement>('#chat-agent-hero');
  const toggle = root.querySelector<HTMLButtonElement>('.chat-agent-hero__toggle');
  if (!hero || !toggle) return;
  hero.classList.toggle('is-collapsed', collapsed);
  toggle.setAttribute('aria-expanded', String(!collapsed));
}

function appendProposalCard(
  root: ParentNode,
  proposal: ClareProposal,
  frameworks: FrameworkEntry[],
  onSaved: () => void
): void {
  const list = root.querySelector('#chat-messages');
  if (!list) return;
  const card = el('li', 'record-proposal confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h3', 'clare-bubble__title', proposal.title));
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
  const minutes = createHubField({
    ariaLabel: `Your estimate for ${proposal.title} (minutes)`,
    type: 'number',
    min: '5',
    step: '5',
    value: String(proposal.suggested_accepted_minutes)
  });
  estimateRow.append(el('span', undefined, 'Your estimate'), minutes.el, el('span', undefined, 'min'));
  card.append(estimateRow);

  const framework = createHubFilter({
    key: 'Framework',
    label: `Framework for ${proposal.title}`,
    value: proposal.framework_id,
    defaultValue: proposal.framework_id,
    options: frameworks.map((fw) => ({ value: fw.id, label: fw.name }))
  });
  card.append(framework.el);

  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost record-proposal__discard', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary record-proposal__confirm', 'Confirm');
  confirm.type = 'button';
  discard.addEventListener('click', () => card.remove());
  confirm.addEventListener('click', async () => {
    const previous = confirm.textContent || 'Confirm';
    setConfirmBusy(confirm, true);
    discard.disabled = true;
    try {
      await tasksApi.acceptClareBatch([
        {
          proposal,
          accepted_minutes: Number(minutes.input.value) || proposal.proposed_minutes,
          framework_id: framework.getValue() || proposal.framework_id
        }
      ]);
      appendSavedCard(card);
      onSaved();
    } catch (err) {
      setConfirmBusy(confirm, false, previous);
      discard.disabled = false;
      showChatError(root, err instanceof Error ? err.message : 'Saving that task failed. You can try again.');
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  list.append(card);
  list.scrollTop = list.scrollHeight;
}

function paintDump(root: ParentNode, result: ClareDumpResult, frameworks: FrameworkEntry[], onSaved: () => void): void {
  appendMessage(root, { role: 'assistant', text: result.voice, agent: 'clare' });
  if (result.toolkit) {
    appendMessage(root, { role: 'assistant', text: toolkitToMarkdown(result.toolkit), agent: 'clare' });
  }
  if (result.questions.length) {
    appendMessage(root, {
      role: 'assistant',
      agent: 'clare',
      text: result.questions.map((question) => `- ${question}`).join('\n')
    });
  }
  if (result.notes.length) {
    appendMessage(root, { role: 'assistant', text: `Parked: ${result.notes.join(' · ')}`, agent: 'clare' });
  }
  for (const proposal of result.proposals) {
    appendProposalCard(root, proposal, frameworks, onSaved);
  }
}

export type ClareChatController = {
  start: () => Promise<void>;
  pickProtocol: (id: string) => void;
  selectAgent: (slug: ChatAgentSlug) => void;
  newChat: () => Promise<void>;
  send: (text?: string) => Promise<void>;
};

export function createClareChatController({
  root,
  isVisible,
  onUnreadChange
}: {
  root: ParentNode;
  isVisible?: () => boolean;
  onUnreadChange?: (unread: boolean) => void;
}): ClareChatController {
  let selectedProtocolId: string | undefined;
  let selectedSlug: ChatAgentSlug = DEFAULT_AGENT_SLUG;
  let frameworks: FrameworkEntry[] = [];
  let started = false;
  let sending = false;
  let turn = 0;
  let waitTimer: number | null = null;
  let waitIndex = 0;
  let statusBubble: HTMLElement | null = null;

  const input = () => root.querySelector<HTMLTextAreaElement>('#chat-input');
  const domainValue = () =>
    root.querySelector<HTMLElement>('#chat-domain')?.dataset.hubValue || 'teaching';
  const currentAgent = () => agentBySlug(selectedSlug);

  function paintRoster(): void {
    const agent = currentAgent();
    applyAgentAccent(root, selectedSlug);
    syncComposer(root, selectedSlug);
    renderAgentPicker(root, {
      selectedSlug,
      onSelect: selectAgent
    });
    paintProtocolTrays(root, {
      canEyebrow: agent.canEyebrow,
      canLabel: `${agent.firstName} protocols`,
      protocols: agent.protocols,
      stuckEyebrow: agent.stuckEyebrow,
      stuckLabel: `${agent.firstName} ADHD tools`,
      stuckProtocols: agent.stuckProtocols,
      onPick: pickProtocol
    });
    markActive(root, selectedProtocolId);
  }

  function clearThread(): void {
    root.querySelector('#chat-messages')?.replaceChildren();
    showChatError(root, '');
    collapseHero(root, false);
  }

  function markUnreadIfHidden(): void {
    if (isVisible?.()) {
      onUnreadChange?.(false);
      return;
    }
    onUnreadChange?.(true);
    setChatUnread(document, true);
  }

  function stopWait(): void {
    if (waitTimer !== null) {
      window.clearInterval(waitTimer);
      waitTimer = null;
    }
    statusBubble?.remove();
    statusBubble = null;
  }

  function showWaitLine(): void {
    const lines = currentAgent().waitLines;
    const line = lines[waitIndex % lines.length];
    waitIndex += 1;
    if (statusBubble) {
      const body = statusBubble.querySelector('.chat-message__body');
      if (body) body.textContent = line;
      return;
    }
    statusBubble = appendMessage(root, { role: 'status', text: line });
    statusBubble?.classList.add('canvas-status');
  }

  async function withWait<T>(work: () => Promise<T>): Promise<T | undefined> {
    const mine = ++turn;
    sending = true;
    setChatBusy(root, true);
    waitIndex = 0;
    showWaitLine();
    waitTimer = window.setInterval(showWaitLine, 1800);
    try {
      const result = await work();
      if (mine !== turn) return undefined;
      return result;
    } catch (err) {
      if (mine !== turn) return undefined;
      stopWait();
      showChatError(root, err instanceof Error ? err.message : `${currentAgent().firstName} could not reply.`);
      return undefined;
    } finally {
      if (mine === turn) {
        stopWait();
        sending = false;
        setChatBusy(root, false);
      }
    }
  }

  async function loadBriefing(protocolId: ClareProtocolId): Promise<void> {
    const briefing = await withWait(() => tasksApi.briefWithClare(protocolId));
    if (!briefing) return;
    appendBriefing(briefing);
    markUnreadIfHidden();
  }

  function appendBriefing(briefing: ClareBriefing): void {
    appendMessage(root, { role: 'assistant', text: briefingToMarkdown(briefing), agent: 'clare' });
  }

  async function loadNetworkBriefing(text?: string, protocolId?: string): Promise<void> {
    const agent = currentAgent();
    if (!agent.inboxName) return;
    const flags = await withWait(() => tasksApi.listAgentInbox(agent.inboxName!));
    if (flags === undefined) return;
    appendMessage(root, {
      role: 'assistant',
      agent: agent.slug,
      text: networkBriefing(agent, flags, { userText: text, protocolId })
    });
    markUnreadIfHidden();
  }

  async function submitDump(text: string): Promise<void> {
    const result = await withWait(() =>
      tasksApi.processDumpWithClare({
        text,
        domain: domainValue(),
        protocol_id: selectedProtocolId as ClareProtocolId | undefined
      })
    );
    if (!result) return;
    paintDump(root, result, frameworks, () => {
      const field = input();
      if (field) field.value = '';
    });
    markUnreadIfHidden();
  }

  async function send(raw?: string): Promise<void> {
    const field = input();
    const text = (raw ?? field?.value ?? '').trim();
    if (!text) {
      if (selectedSlug !== 'clare') {
        await loadNetworkBriefing(undefined, selectedProtocolId);
        return;
      }
      if (selectedProtocolId && isBriefingProtocol(selectedProtocolId as ClareProtocolId)) {
        await loadBriefing(selectedProtocolId as ClareProtocolId);
        return;
      }
      await loadBriefing('morning-sweep');
      return;
    }
    appendMessage(root, { role: 'user', text });
    collapseHero(root, true);
    if (field) field.value = '';
    if (selectedSlug !== 'clare') {
      await loadNetworkBriefing(text, selectedProtocolId);
      return;
    }
    await submitDump(text);
  }

  function pickProtocol(id: string): void {
    selectedProtocolId = id;
    markActive(root, id);
    const text = input()?.value.trim() ?? '';
    if (selectedSlug !== 'clare') {
      void loadNetworkBriefing(text || undefined, id);
      return;
    }
    if (text) {
      void send(text);
      return;
    }
    if (isBriefingProtocol(id as ClareProtocolId)) {
      void loadBriefing(id as ClareProtocolId);
      return;
    }
    input()?.focus();
    appendMessage(root, {
      role: 'assistant',
      agent: 'clare',
      text: 'Dump the thing first — I cannot shrink a blank page.'
    });
  }

  function selectAgent(slug: ChatAgentSlug): void {
    if (slug === selectedSlug) return;
    selectedSlug = slug;
    selectedProtocolId = undefined;
    paintRoster();
    const empty = !root.querySelector('#chat-messages')?.childElementCount;
    if (empty) void newChat();
  }

  async function newChat(): Promise<void> {
    turn += 1;
    stopWait();
    sending = false;
    setChatBusy(root, false);
    selectedProtocolId = undefined;
    markActive(root, undefined);
    clearThread();
    paintRoster();
    if (selectedSlug !== 'clare') {
      await loadNetworkBriefing();
      return;
    }
    await loadBriefing('morning-sweep');
  }

  function bindChrome(): void {
    root.querySelector('#chat-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void send();
    });
    input()?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      void send();
    });
    root.querySelector('#chat-new')?.addEventListener('click', () => {
      void newChat();
    });
  }

  async function start(): Promise<void> {
    if (started) return;
    started = true;
    bindChrome();
    paintRoster();
    const templates = await tasksApi.listTemplates();
    frameworks = templates.frameworks as FrameworkEntry[];
    await newChat();
  }

  return { start, pickProtocol, selectAgent, newChat, send };
}
