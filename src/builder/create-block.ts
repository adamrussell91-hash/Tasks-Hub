import type { PageBlock, PageBlockType } from '@/schemas/page-block';

export const PAGE_BLOCK_TYPES = [
  'heading',
  'rich_text',
  'callout',
  'quote',
  'divider',
  'spacer'
] as const satisfies readonly PageBlockType[];

export const PAGE_BLOCK_LABEL: Record<PageBlockType, string> = {
  heading: 'Heading',
  rich_text: 'Rich text',
  callout: 'Callout',
  quote: 'Quote',
  divider: 'Divider',
  spacer: 'Spacer'
};

/** Same family grouping as Teaching Hub's lesson palette, trimmed to page types. */
export const PAGE_BLOCK_GROUPS: Array<{ label: string; types: PageBlockType[] }> = [
  { label: 'Basic', types: ['rich_text', 'heading', 'callout', 'quote', 'divider'] },
  { label: 'Layout', types: ['spacer'] }
];

function nowIso(): string {
  return new Date().toISOString();
}

function shared(id: string) {
  return {
    id,
    type: 'block' as const,
    created_at: nowIso(),
    updated_at: nowIso(),
    schema_version: 1 as const
  };
}

export function newBlockId(): string {
  return `block_${Math.random().toString(36).slice(2, 10)}`;
}

/** Teaching Hub `createBlock` — same defaults, Tasks page subset. */
export function createBlock(type: PageBlockType, id = newBlockId()): PageBlock {
  const base = shared(id);
  switch (type) {
    case 'rich_text':
      return { ...base, block_type: 'rich_text', variant: 'medium', content: { html: '' } };
    case 'heading':
      return { ...base, block_type: 'heading', variant: 'section', content: { text: '' } };
    case 'callout':
      return {
        ...base,
        block_type: 'callout',
        variant: 'medium',
        content: { style: 'information', body: '' }
      };
    case 'quote':
      return { ...base, block_type: 'quote', variant: 'medium', content: { text: '', attribution: '' } };
    case 'divider':
      return { ...base, block_type: 'divider', variant: 'medium', content: {} };
    case 'spacer':
      return { ...base, block_type: 'spacer', variant: 'medium', content: { size: 'medium' } };
  }
}
