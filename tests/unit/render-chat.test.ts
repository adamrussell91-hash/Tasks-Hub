import { describe, expect, it } from 'vitest';
import {
  appendMessage,
  renderInlineMarkdown,
  setChatUnread,
  setConfirmBusy,
  showChatError
} from '@/chat/render-chat';

function chatRoot(): HTMLElement {
  const root = document.createElement('div');
  const list = document.createElement('ul');
  list.id = 'chat-messages';
  const error = document.createElement('p');
  error.id = 'chat-error';
  error.hidden = true;
  const fab = document.createElement('button');
  fab.className = 'floating-chat-button';
  root.append(list, error, fab);
  return root;
}

describe('render-chat', () => {
  it('appends user and assistant bubbles without using innerHTML', () => {
    const root = chatRoot();
    appendMessage(root, { role: 'user', text: '<script>alert(1)</script>' });
    appendMessage(root, { role: 'assistant', text: '**Overdue**\n- Lock the brief' });
    const items = root.querySelectorAll('.chat-message');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('chat-message--user')).toBe(true);
    expect(items[0].textContent).toBe('<script>alert(1)</script>');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.chat-message--assistant strong')?.textContent).toBe('Overdue');
    expect(root.querySelector('.chat-message--assistant li')?.textContent).toBe('Lock the brief');
  });

  it('renders a single-line markdown span without wrapping a paragraph', () => {
    const host = document.createElement('div');
    renderInlineMarkdown(host, 'Just **one** line');
    expect(host.querySelector('p')).toBeNull();
    expect(host.querySelector('strong')?.textContent).toBe('one');
  });

  it('shows and hides the chat error banner', () => {
    const root = chatRoot();
    showChatError(root, 'Saving that task failed. You can try again.');
    const banner = root.querySelector<HTMLElement>('#chat-error')!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toMatch(/saving that task failed/i);
    showChatError(root, '');
    expect(banner.hidden).toBe(true);
  });

  it('sets Confirm to Saving… while busy', () => {
    const button = document.createElement('button');
    button.textContent = 'Confirm';
    setConfirmBusy(button, true);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Saving…');
    setConfirmBusy(button, false);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Confirm');
  });

  it('marks the floating button unread', () => {
    const root = chatRoot();
    setChatUnread(root, true);
    const fab = root.querySelector<HTMLElement>('.floating-chat-button')!;
    expect(fab.classList.contains('has-unread')).toBe(true);
    expect(fab.dataset.unread).toBe('true');
    setChatUnread(root, false);
    expect(fab.classList.contains('has-unread')).toBe(false);
  });
});
