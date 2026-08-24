import { describe, expect, it } from 'vitest';
import {
  createHubField,
  createHubFilter,
  createHubPills,
  createHubSearch,
  createHubToolbar,
  domainFilterOptions,
  priorityFilterOptions
} from '@/views/hub-kit';

describe('hub-kit controls', () => {
  it('builds the kit search snippet, not a bare input', () => {
    const search = createHubSearch({
      placeholder: 'Filter…',
      ariaLabel: 'Filter items',
      value: 'mind'
    });
    expect(search.el.classList.contains('hub-search')).toBe(true);
    expect(search.el.tagName).toBe('LABEL');
    expect(search.input.className).toBe('hub-search__input');
    expect(search.input.value).toBe('mind');
    expect(search.el.querySelector('.visually-hidden')?.textContent).toBe('Filter items');
  });

  it('builds a kit filter button instead of a native select', () => {
    const filter = createHubFilter({
      key: 'Domain',
      label: 'Domain',
      defaultValue: 'all',
      options: domainFilterOptions(),
      value: 'teaching'
    });
    expect(filter.el.tagName).toBe('BUTTON');
    expect(filter.el.classList.contains('hub-filter')).toBe(true);
    expect(filter.el.querySelector('.hub-filter__key')?.textContent).toBe('Domain');
    expect(filter.el.querySelector('[data-hub-value]')?.textContent).toBe('teaching');
    expect(filter.el.classList.contains('is-set')).toBe(true);
    expect(filter.getValue()).toBe('teaching');
  });

  it('marks pills with the kit pressed state', () => {
    const pills = createHubPills({
      label: 'View',
      role: 'tablist',
      items: [
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' }
      ],
      value: 'week',
      onSelect: () => undefined
    });
    expect(pills.className).toBe('hub-pills');
    const buttons = [...pills.querySelectorAll('.hub-pills__btn')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.classList.contains('is-active')).toBe(true);
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('false');
  });

  it('wraps toolbars in the shared hub-toolbar class', () => {
    const bar = createHubToolbar('board-filter');
    expect(bar.className).toBe('hub-toolbar board-filter');
    bar.append(createHubField({ ariaLabel: 'Title' }).el);
    expect(bar.querySelector('.hub-search')).not.toBeNull();
  });

  it('shares domain and priority option lists', () => {
    expect(domainFilterOptions()[0]).toEqual({ value: 'all', label: 'All domains' });
    expect(priorityFilterOptions(false).map((item) => item.value)).toEqual([
      'urgent',
      'high',
      'medium',
      'low'
    ]);
  });
});
