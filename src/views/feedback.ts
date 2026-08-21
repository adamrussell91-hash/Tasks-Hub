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
