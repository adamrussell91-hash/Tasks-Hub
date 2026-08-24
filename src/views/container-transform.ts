type ViewTransition = { finished: Promise<void> };

type DocumentWithVT = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

/** View Transitions API wrapper from the Cotton Glass container-transform note. */
export function runContainerTransform(update: () => void, guard?: { current: boolean }): void {
  if (guard?.current) return;
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as DocumentWithVT;
  const applyOnce = (() => {
    let applied = false;
    return () => {
      if (applied) return;
      applied = true;
      update();
    };
  })();

  // Call on the document — extracting the method loses `this` and throws Illegal invocation.
  if (typeof doc.startViewTransition === 'function' && !reduceMotion) {
    if (guard) guard.current = true;
    try {
      const transition = doc.startViewTransition(applyOnce);
      void Promise.resolve(transition.ready).catch(() => applyOnce());
      void Promise.resolve(transition.finished).finally(() => {
        applyOnce();
        if (guard) guard.current = false;
      });
      return;
    } catch {
      if (guard) guard.current = false;
    }
  }
  applyOnce();
}

export function cardTransitionName(id: string): string {
  return `hub-card-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
