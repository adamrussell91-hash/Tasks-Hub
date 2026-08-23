export type EntityBannerHandle = {
  dispose: () => void;
  update: (next: Record<string, unknown>) => void;
};

/** Lesson-page cover banner is Teaching Hub chrome. Tasks pages use Cotton Glass headers. */
export function renderEntityBanner(
  host: HTMLElement,
  options: {
    title: string;
    eyebrow?: string;
    cover?: unknown;
    media?: unknown;
    entityId?: string;
    editable?: boolean;
    size?: string;
    fallback?: string;
    editButtonClass?: string;
    onSave?: (cover: unknown) => void;
  }
): EntityBannerHandle {
  host.replaceChildren();
  const title = document.createElement('p');
  title.className = 'hub-card__title';
  title.textContent = options.title;
  host.append(title);
  return {
    dispose() {
      host.replaceChildren();
    },
    update(next) {
      if (typeof next.title === 'string') title.textContent = next.title;
    }
  };
}
