import { afterEach, describe, expect, it, vi } from 'vitest';
import { runContainerTransform } from '@/views/container-transform';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('runContainerTransform', () => {
  it('still applies the update when startViewTransition throws', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => {
        throw new Error('Illegal invocation');
      }
    });

    const update = vi.fn();
    runContainerTransform(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('applies the update if the view transition finishes without calling it', async () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as MediaQueryList);
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: () => ({
        ready: Promise.reject(new Error('skipped')),
        finished: Promise.resolve()
      })
    });

    const update = vi.fn();
    runContainerTransform(update);
    await vi.waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });
  });
});
