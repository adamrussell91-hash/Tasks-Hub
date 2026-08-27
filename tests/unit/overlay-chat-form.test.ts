import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const viewsCss = readFileSync(path.resolve(process.cwd(), 'src/styles/views.css'), 'utf8');

describe('mobile overlay chat form', () => {
  it('stacks the composer as a column so Domain/Send sit under the textarea', () => {
    const formRule = viewsCss.match(
      /\.chat-view\[data-panel-mode='overlay'\]\s+\.chat-form\s*\{([^}]+)\}/g
    );
    expect(formRule?.some((rule) => /flex-direction:\s*column/.test(rule))).toBe(true);
  });

  it('makes the textarea full width under the overlay form', () => {
    expect(viewsCss).toMatch(
      /\.chat-view\[data-panel-mode='overlay'\]\s+\.chat-input[\s\S]{0,80}width:\s*100%/
    );
  });

  it('uses compact texting-sized bubbles on mobile', () => {
    expect(viewsCss).toMatch(/max-width:\s*min\(82%,\s*17\.5rem\)/);
    expect(viewsCss).toMatch(/\.chat-message__avatar\s*\{[^}]*width:\s*1\.6rem/);
  });
});
