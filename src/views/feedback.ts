/** Shared loading / error / busy helpers so views never stick on a spinner. */

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

export function errorMessage(err: unknown, fallback = 'Request failed'): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

export function renderLoadError(
  host: HTMLElement,
  err: unknown,
  onRetry: () => void,
  context: string
): void {
  host.replaceChildren();
  host.append(el('p', 'empty-state', `${context}: ${errorMessage(err)}`));
  const retry = el('button', 'btn btn--secondary', 'Retry');
  retry.type = 'button';
  retry.addEventListener('click', onRetry);
  host.append(retry);
}

export function renderInlineError(host: HTMLElement, err: unknown): void {
  host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
}

export function showConfirmWrite(
  host: HTMLElement,
  title: string,
  summary: string,
  onConfirm: () => Promise<void>,
  confirmLabel = 'Confirm'
): void {
  host.replaceChildren();
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'page-header__eyebrow', 'Proposed write'));
  card.append(el('h2', 'page-header__title', title));
  card.append(el('p', 'page-header__supporting', `${summary} Do not apply until Confirm.`));
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  const confirm = el('button', 'btn btn--primary', confirmLabel);
  confirm.type = 'button';
  discard.addEventListener('click', () => host.replaceChildren());
  confirm.addEventListener('click', async () => {
    confirm.disabled = true;
    discard.disabled = true;
    try {
      await onConfirm();
      host.replaceChildren(el('p', 'canvas-status', 'Applied.'));
    } catch (err) {
      host.replaceChildren(el('p', 'empty-state', errorMessage(err)));
    }
  });
  actions.append(discard, confirm);
  card.append(actions);
  host.append(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export async function withBusy<T>(
  buttons: HTMLButtonElement[],
  work: () => Promise<T>,
  pendingLabel?: string
): Promise<T> {
  const previous = buttons.map((btn) => ({ btn, text: btn.textContent, disabled: btn.disabled }));
  for (const btn of buttons) {
    btn.disabled = true;
    if (pendingLabel) btn.textContent = pendingLabel;
  }
  try {
    return await work();
  } finally {
    for (const row of previous) {
      row.btn.disabled = row.disabled;
      if (pendingLabel) row.btn.textContent = row.text;
    }
  }
}
