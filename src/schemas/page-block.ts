import { z } from 'zod';

/** Teaching Hub block shape, trimmed to the types a task/project page needs. */
export const PageBlockTypeSchema = z.enum([
  'heading',
  'rich_text',
  'callout',
  'quote',
  'divider',
  'spacer'
]);

export const CalloutStyleSchema = z.enum([
  'information',
  'important',
  'warning',
  'extension',
  'scaffold',
  'example',
  'remember',
  'teacher'
]);

export const HeadingVariantSchema = z.enum(['page', 'section', 'subsection']);
export const SpacerSizeSchema = z.enum(['small', 'medium', 'large']);

export const PageBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal('block').default('block'),
  block_type: PageBlockTypeSchema,
  variant: z.string().default('medium'),
  content: z.record(z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
  schema_version: z.literal(1)
});

export type PageBlock = z.infer<typeof PageBlockSchema>;
export type PageBlockType = z.infer<typeof PageBlockTypeSchema>;
export type CalloutStyle = z.infer<typeof CalloutStyleSchema>;
export type HeadingVariant = z.infer<typeof HeadingVariantSchema>;
export type SpacerSize = z.infer<typeof SpacerSizeSchema>;
