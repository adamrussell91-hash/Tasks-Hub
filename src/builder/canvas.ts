import type { CalloutStyle, HeadingVariant, PageBlock, PageBlockType, SpacerSize } from '@/schemas/page-block';
import { createBlock, PAGE_BLOCK_GROUPS, PAGE_BLOCK_LABEL } from '@/builder/create-block';

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

export type BlockCanvasHandle = {
  update(blocks: PageBlock[]): void;
  insertType(type: PageBlockType): void;
};

function touch(block: PageBlock, content: Record<string, unknown>, variant = block.variant): PageBlock {
  return { ...block, content, variant, updated_at: new Date().toISOString() };
}

function fieldInput(className: string, label: string, value: string): HTMLInputElement {
  const input = el('input', `hub-search ${className}`) as HTMLInputElement;
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function createHeadingEditor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  const text = fieldInput('block-editor__heading-text', 'Heading text', String(block.content.text ?? ''));
  const variant = el('select', 'hub-filter block-editor__heading-variant') as HTMLSelectElement;
  variant.setAttribute('aria-label', 'Heading level');
  for (const option of ['page', 'section', 'subsection'] as const) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.selected = block.variant === option;
    variant.append(opt);
  }
  const emit = () => onChange(touch(block, { text: text.value }, variant.value as HeadingVariant));
  text.addEventListener('input', emit);
  variant.addEventListener('change', emit);
  fields.append(text, variant);
  return fields;
}

function createRichTextEditor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  const surface = el('div', 'block-editor__rich');
  surface.contentEditable = 'true';
  surface.setAttribute('role', 'textbox');
  surface.setAttribute('aria-multiline', 'true');
  surface.setAttribute('aria-label', 'Rich text');
  surface.innerHTML = String(block.content.html ?? '');
  surface.addEventListener('input', () => onChange(touch(block, { html: surface.innerHTML })));
  fields.append(surface);
  return fields;
}

function createCalloutEditor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  const style = el('select', 'hub-filter block-editor__callout-style') as HTMLSelectElement;
  style.setAttribute('aria-label', 'Callout style');
  for (const option of [
    'information',
    'important',
    'warning',
    'extension',
    'scaffold',
    'example',
    'remember',
    'teacher'
  ] as const) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.selected = block.content.style === option;
    style.append(opt);
  }
  const title = fieldInput('block-editor__callout-title', 'Callout title', String(block.content.title ?? ''));
  const body = document.createElement('textarea');
  body.className = 'hub-search block-editor__callout-body';
  body.rows = 4;
  body.value = String(block.content.body ?? '');
  body.setAttribute('aria-label', 'Callout body');
  const emit = () =>
    onChange(
      touch(block, {
        style: style.value as CalloutStyle,
        title: title.value.trim() || undefined,
        body: body.value
      })
    );
  style.addEventListener('change', emit);
  title.addEventListener('input', emit);
  body.addEventListener('input', emit);
  fields.append(style, title, body);
  return fields;
}

function createQuoteEditor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  const text = document.createElement('textarea');
  text.className = 'hub-search block-editor__quote-text';
  text.rows = 3;
  text.value = String(block.content.text ?? '');
  text.setAttribute('aria-label', 'Quote');
  const attr = fieldInput(
    'block-editor__quote-attr',
    'Attribution',
    String(block.content.attribution ?? '')
  );
  const emit = () => onChange(touch(block, { text: text.value, attribution: attr.value }));
  text.addEventListener('input', emit);
  attr.addEventListener('input', emit);
  fields.append(text, attr);
  return fields;
}

function createDividerEditor(): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  fields.append(el('hr', 'block-divider'));
  return fields;
}

function createSpacerEditor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  const fields = el('div', 'block-editor__fields');
  const size = el('select', 'hub-filter') as HTMLSelectElement;
  size.setAttribute('aria-label', 'Spacer size');
  for (const option of ['small', 'medium', 'large'] as const) {
    const opt = document.createElement('option');
    opt.value = option;
    opt.textContent = option;
    opt.selected = (block.content.size ?? 'medium') === option;
    size.append(opt);
  }
  size.addEventListener('change', () => onChange(touch(block, { size: size.value as SpacerSize })));
  fields.append(size, el('div', `block-spacer block-spacer--${String(block.content.size ?? 'medium')}`));
  return fields;
}

function editorFor(block: PageBlock, onChange: (next: PageBlock) => void): HTMLElement {
  switch (block.block_type) {
    case 'heading':
      return createHeadingEditor(block, onChange);
    case 'rich_text':
      return createRichTextEditor(block, onChange);
    case 'callout':
      return createCalloutEditor(block, onChange);
    case 'quote':
      return createQuoteEditor(block, onChange);
    case 'divider':
      return createDividerEditor();
    case 'spacer':
      return createSpacerEditor(block, onChange);
  }
}

export function mountBlockPalette(onInsert: (type: PageBlockType) => void): HTMLElement {
  const nav = el('aside', 'page-palette');
  nav.setAttribute('aria-label', 'Block palette');
  for (const group of PAGE_BLOCK_GROUPS) {
    const family = el('div', 'page-palette__family');
    family.append(el('p', 'page-palette__label', group.label));
    for (const type of group.types) {
      const btn = el('button', 'btn btn--ghost page-palette__btn', PAGE_BLOCK_LABEL[type]);
      btn.type = 'button';
      btn.addEventListener('click', () => onInsert(type));
      family.append(btn);
    }
    nav.append(family);
  }
  return nav;
}

export function mountBlockCanvas(
  host: HTMLElement,
  blocks: PageBlock[],
  onChange: (blocks: PageBlock[]) => void
): BlockCanvasHandle {
  let current = blocks;

  function replace(id: string, next: PageBlock): void {
    current = current.map((block) => (block.id === id ? next : block));
    onChange(current);
  }

  function move(id: string, delta: number): void {
    const index = current.findIndex((block) => block.id === id);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
    const copy = [...current];
    const [item] = copy.splice(index, 1);
    copy.splice(nextIndex, 0, item!);
    current = copy;
    onChange(current);
    paint();
  }

  function remove(id: string): void {
    current = current.filter((block) => block.id !== id);
    onChange(current);
    paint();
  }

  function paint(): void {
    host.replaceChildren();
    host.className = 'block-canvas';
    if (!current.length) {
      host.append(el('p', 'empty-state', 'Add a heading or note from the palette — same block engine as Teaching Hub.'));
    }
    for (const block of current) {
      const card = el('article', 'block-editor');
      card.dataset.blockId = block.id;
      const toolbar = el('div', 'block-editor__toolbar');
      toolbar.append(el('span', 'block-editor__kind', PAGE_BLOCK_LABEL[block.block_type]));
      const actions = el('div', 'hub-row__actions');
      const up = el('button', 'btn btn--ghost', 'Up');
      up.type = 'button';
      up.addEventListener('click', () => move(block.id, -1));
      const down = el('button', 'btn btn--ghost', 'Down');
      down.type = 'button';
      down.addEventListener('click', () => move(block.id, 1));
      const del = el('button', 'btn btn--ghost', 'Remove');
      del.type = 'button';
      del.addEventListener('click', () => remove(block.id));
      actions.append(up, down, del);
      toolbar.append(actions);
      card.append(toolbar, editorFor(block, (next) => replace(block.id, next)));
      host.append(card);
    }
  }

  paint();

  return {
    update(next) {
      current = next;
      paint();
    },
    insertType(type) {
      current = [...current, createBlock(type)];
      onChange(current);
      paint();
    }
  };
}
