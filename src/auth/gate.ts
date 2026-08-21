import { apiGet, apiPost, ApiClientError } from '@/api/client';

export interface SessionInfo {
  authenticated: boolean;
  expiresAt?: number;
}

export async function fetchSession(): Promise<SessionInfo> {
  return apiGet<SessionInfo>('/api/session');
}

export function normalizePassphrase(value: string): string {
  return value.trim();
}

export const API_SIGN_IN_URL = 'https://tasks-api.adam-russell.com';

export function messageForSignInFailure(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'invalid_credentials') return 'Invalid passphrase';
    if (err.code === 'forbidden' || err.code === 'network_error') {
      return `Could not sign in from this tab. Open ${API_SIGN_IN_URL}`;
    }
    return err.message || 'Unable to sign in. Please try again.';
  }
  return 'Unable to sign in. Please try again.';
}

export async function authenticate(passphrase: string): Promise<SessionInfo> {
  return apiPost<SessionInfo>('/api/auth', { passphrase: normalizePassphrase(passphrase) });
}

export async function logout(): Promise<void> {
  await apiPost<{ loggedOut: boolean }>('/api/logout');
}

export interface SignInOptions {
  onSuccess?: (session: SessionInfo) => void;
}

/** Decorative Wave band from design-kit/snippets/sign-in.html */
function createSignInWave(): HTMLElement {
  const wave = document.createElement('div');
  wave.className = 'sign-in__wave';
  wave.setAttribute('aria-hidden', 'true');
  wave.innerHTML = `
      <div class="sign-in__wave-band sign-in__wave-band--back">
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="sign-in-wave-back" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--wave)" stop-opacity="0.28"/>
              <stop offset="1" stop-color="var(--marine)" stop-opacity="0.4"/>
            </linearGradient>
          </defs>
          <path fill="url(#sign-in-wave-back)" d="M0 48C150 20 450 76 600 48C750 20 1050 76 1200 48V140H0Z"/>
        </svg>
      </div>
      <div class="sign-in__wave-band sign-in__wave-band--mid">
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="sign-in-wave-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--wave)" stop-opacity="0.5"/>
              <stop offset="1" stop-color="var(--marine)" stop-opacity="0.82"/>
            </linearGradient>
          </defs>
          <path fill="url(#sign-in-wave-mid)" d="M0 70C150 48 450 92 600 70C750 48 1050 92 1200 70V140H0Z"/>
        </svg>
      </div>
      <div class="sign-in__wave-band sign-in__wave-band--front">
        <svg viewBox="0 0 1200 140" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="sign-in-wave-front" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--wave)"/>
              <stop offset="1" stop-color="var(--depth)"/>
            </linearGradient>
          </defs>
          <path fill="url(#sign-in-wave-front)" d="M0 94C150 78 450 110 600 94C750 78 1050 110 1200 94V140H0Z"/>
        </svg>
      </div>`;
  return wave;
}

/** Passphrase gate from design-kit/snippets/sign-in.html + sign-in.css */
export function renderSignIn(container: HTMLElement, options?: SignInOptions): void {
  container.replaceChildren();

  const wrapper = document.createElement('div');
  wrapper.className = 'sign-in';

  const form = document.createElement('form');
  form.className = 'sign-in__card';
  form.noValidate = true;

  const mark = document.createElement('img');
  mark.className = 'sign-in__mark';
  mark.src = new URL('icons/tasks.svg', document.baseURI).href;
  mark.alt = '';
  mark.width = 56;
  mark.height = 56;

  const brand = document.createElement('p');
  brand.className = 'sign-in__brand';
  brand.textContent = 'Tasks Hub';

  const title = document.createElement('h1');
  title.className = 'sign-in__title';
  title.textContent = 'Sign in';

  const field = document.createElement('div');
  field.className = 'sign-in__field';

  const inputId = 'sign-in-passphrase';

  const label = document.createElement('label');
  label.className = 'sign-in__label';
  label.htmlFor = inputId;
  label.textContent = 'Passphrase';

  const input = document.createElement('input');
  input.className = 'sign-in__input';
  input.id = inputId;
  input.name = 'passphrase';
  input.type = 'password';
  input.required = true;
  input.autocomplete = 'current-password';
  input.enterKeyHint = 'go';

  const error = document.createElement('p');
  error.className = 'sign-in__error';
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const submit = document.createElement('button');
  submit.className = 'btn btn--primary sign-in__submit';
  submit.type = 'submit';
  submit.textContent = 'Sign in';

  field.append(label, input);
  form.append(createSignInWave(), mark, brand, title, field, error, submit);
  wrapper.append(form);
  container.append(wrapper);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    submit.disabled = true;

    try {
      const session = await authenticate(input.value);
      if (!session.authenticated) {
        showError('Invalid passphrase');
        return;
      }
      const confirmed = await fetchSession();
      if (!confirmed.authenticated) {
        showError(`Safari blocked the session cookie. Open ${API_SIGN_IN_URL}`);
        return;
      }
      options?.onSuccess?.(session);
    } catch (err) {
      showError(messageForSignInFailure(err));
    } finally {
      submit.disabled = false;
    }
  });

  input.focus();

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }
}
