import { preferredDomains } from '@/domain/queries';
import {
  CLARE_ADHD_PROTOCOLS,
  CLARE_PROTOCOLS,
  type ClareProtocol,
  type ClareProtocolId
} from '@/domain/clare-protocols';
import { createHubFilter, TASK_DOMAINS } from '@/views/hub-kit';

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

export function protocolButton(protocol: ClareProtocol, onPick: (id: ClareProtocolId) => void): HTMLButtonElement {
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

function protocolTray(
  title: string,
  label: string,
  protocols: readonly ClareProtocol[],
  onPick: (id: ClareProtocolId) => void
): HTMLElement {
  const section = el('section', 'clare-protocols agent-protocol-pills');
  section.append(el('p', 'page-header__eyebrow', title));
  const tray = el('div', 'hub-pills');
  tray.setAttribute('role', 'group');
  tray.setAttribute('aria-label', label);
  for (const protocol of protocols) {
    tray.append(protocolButton(protocol, onPick));
  }
  section.append(tray);
  return section;
}

export function buildChatView(onPickProtocol: (id: ClareProtocolId) => void): HTMLElement {
  const view = el('section', 'chat-view');
  view.id = 'chat-view';
  view.setAttribute('aria-label', 'Chat with Clare');
  view.hidden = true;
  view.style.setProperty('--agent-accent', 'var(--wave)');

  const heading = el('div', 'section-heading chat-view__toolbar');
  const neu = el('button', 'chat-new-button', 'New chat');
  neu.type = 'button';
  neu.id = 'chat-new';
  heading.append(neu);
  view.append(heading);

  const hero = el('div', 'chat-agent-hero');
  hero.id = 'chat-agent-hero';
  hero.setAttribute('aria-live', 'polite');
  const toggle = el('button', 'chat-agent-hero__toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.append(el('span', 'chat-agent-hero__mark', 'CD'));
  const copy = el('span', 'chat-agent-hero__copy');
  copy.append(
    el('span', 'chat-agent-hero__name', 'Clare DeMind'),
    el('span', 'chat-agent-hero__role', 'Dump the chaos. She sorts it, then you confirm.')
  );
  toggle.append(copy);
  hero.append(toggle);
  view.append(hero);

  view.append(protocolTray('Clare can', 'Clare protocols', CLARE_PROTOCOLS, onPickProtocol));
  view.append(protocolTray('When stuck', 'Clare ADHD tools', CLARE_ADHD_PROTOCOLS, onPickProtocol));

  const error = el('p', 'chat-error');
  error.id = 'chat-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  view.append(error);

  const messages = el('ul', 'chat-messages');
  messages.id = 'chat-messages';
  messages.setAttribute('aria-live', 'polite');
  view.append(messages);

  const form = el('form', 'chat-form');
  form.id = 'chat-form';
  const label = el('label', 'sr-only', 'Message');
  label.htmlFor = 'chat-input';
  const input = el('textarea', 'chat-input') as HTMLTextAreaElement;
  input.id = 'chat-input';
  input.name = 'message';
  input.required = true;
  input.rows = 2;
  input.placeholder = 'Dump the chaos. One thing, or twelve.';
  input.setAttribute('aria-label', 'Message');
  const preferred = preferredDomains()[0] ?? 'teaching';
  const domain = createHubFilter({
    key: 'Domain',
    label: 'Default domain',
    value: preferred,
    defaultValue: preferred,
    options: TASK_DOMAINS.map((value) => ({ value, label: value }))
  });
  domain.el.id = 'chat-domain';
  const send = el('button', 'btn btn--primary', 'Send');
  send.id = 'chat-send';
  send.type = 'submit';
  const tools = el('div', 'chat-form__tools');
  tools.append(domain.el, send);
  form.append(label, input, tools);
  view.append(form);

  return view;
}

export function buildChatHome(): HTMLElement {
  const home = el('div');
  home.id = 'chat-view-home';
  return home;
}

export function buildFloatingChatButton(): HTMLButtonElement {
  const button = el('button', 'floating-chat-button', '💬');
  button.type = 'button';
  button.id = 'clare-chat-button';
  button.setAttribute('aria-label', 'Chat with Clare');
  return button;
}
