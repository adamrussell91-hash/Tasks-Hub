import type { MapColorToken, MapLine } from '@/schemas/map';
import { lineTrackDefs, missingStandardYearTracks } from '@/domain/maps-layout';
import { discCss, letterCss } from '@/domain/maps-colors';
import { createOutlineIcon, RAIL_ICON_PATHS } from '@/shell/icons';
import { renderCardMenu, type CardMenuItem } from '@/views/card-menu';
import { createHubFilter, createHubToolbar, el } from '@/views/hub-kit';

export type MapMode = 'view' | 'edit';

export type ExpandableSearchOptions = {
  placeholder: string;
  ariaLabel: string;
  value?: string;
  open?: boolean;
  onInput: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
};

export function createExpandableSearch(options: ExpandableSearchOptions): {
  root: HTMLElement;
  input: HTMLInputElement;
} {
  let open = Boolean(options.open || options.value);
  const root = el('div', 'map-index__search-slot');
  const toggle = el('button', 'hub-icon-btn map-index__search-toggle') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.title = options.ariaLabel;
  toggle.setAttribute('aria-label', options.ariaLabel);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.append(createOutlineIcon(RAIL_ICON_PATHS.search ?? []));

  const search = el('label', 'hub-search map-index__search');
  search.append(el('span', 'visually-hidden', options.ariaLabel));
  const input = el('input', 'hub-search__input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = options.placeholder;
  input.setAttribute('aria-label', options.ariaLabel);
  if (options.value) input.value = options.value;
  search.append(input);

  const paint = () => {
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    search.hidden = !open;
    toggle.hidden = open;
  };

  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    paint();
    options.onOpenChange?.(open);
    if (open) input.focus();
  };

  toggle.addEventListener('click', () => setOpen(true));
  input.addEventListener('input', () => options.onInput(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (input.value) {
      input.value = '';
      options.onInput('');
      return;
    }
    setOpen(false);
    toggle.focus();
  });
  input.addEventListener('blur', () => {
    if (input.value.trim()) return;
    setOpen(false);
  });

  paint();
  root.append(toggle, search);
  return { root, input };
}

export type MapToolbarHandlers = {
  onSelectMap: (id: string) => void;
  onMode: (mode: MapMode) => void;
  onExport: () => void;
  onNewMap: () => void;
  onFullscreen: () => void;
  onAddLine: () => void;
  onAddProgram: () => void;
  onAddCompetition: () => void;
  onJoin: () => void;
};

export function createMapToolbar(options: {
  maps: Array<{ id: string; title: string }>;
  currentId: string;
  mode: MapMode;
  fullscreen: boolean;
  joining: boolean;
  handlers: MapToolbarHandlers;
}): HTMLElement {
  const toolbar = createHubToolbar('map-toolbar');
  const select = createHubFilter({
    key: 'Map',
    label: 'Map',
    defaultValue: options.currentId,
    options: options.maps.map((map) => ({ value: map.id, label: map.title })),
    value: options.currentId,
    onChange: options.handlers.onSelectMap
  });

  const items: CardMenuItem[] = [
    {
      id: 'view',
      label: options.mode === 'view' ? 'Viewing' : 'View',
      onSelect: () => options.handlers.onMode('view')
    },
    {
      id: 'edit',
      label: options.mode === 'edit' ? 'Editing' : 'Edit',
      onSelect: () => options.handlers.onMode('edit')
    },
    { id: 'export', label: 'Export', onSelect: options.handlers.onExport },
    { id: 'new', label: 'New map', onSelect: options.handlers.onNewMap },
    {
      id: 'fullscreen',
      label: options.fullscreen ? 'Exit full screen' : 'Full screen',
      onSelect: options.handlers.onFullscreen
    }
  ];
  if (options.mode === 'edit') {
    items.push(
      { id: 'add-line', label: 'Add line', onSelect: options.handlers.onAddLine },
      { id: 'add-program', label: 'Add program', onSelect: options.handlers.onAddProgram },
      { id: 'add-competition', label: 'Add competition', onSelect: options.handlers.onAddCompetition },
      {
        id: 'join',
        label: options.joining ? 'Stop joining' : 'Join',
        onSelect: options.handlers.onJoin
      }
    );
  }

  toolbar.append(
    select.el,
    renderCardMenu('Map menu', items, { heading: 'Map', inline: true })
  );
  return toolbar;
}

export type MapKeyHandlers = {
  onMove: (id: string, delta: -1 | 1) => void;
  onAddYearLine: (line: MapLine) => void;
};

export function createMapKey(options: {
  lines: MapLine[];
  mode: MapMode;
  handlers: MapKeyHandlers;
}): HTMLElement {
  const key = el('div', 'map-key');
  key.setAttribute('aria-label', 'Map key');
  for (const [index, line] of options.lines.entries()) {
    const item = el('span', 'map-key__item');
    const mark = el('span', 'map-key__disc', line.letter);
    mark.style.background = discCss(line.color as MapColorToken);
    mark.style.color = letterCss(line.color as MapColorToken);
    if (line.color === 'yellow' || line.color === 'high-sea') {
      mark.style.boxShadow = `inset 0 0 0 2px ${discCss(line.color)}`;
    }
    item.append(mark, el('span', 'map-key__name', `${line.name} Line`));
    const yearLines = lineTrackDefs(line);
    if (yearLines.length) {
      const trackList = el('span', 'map-key__year-lines');
      trackList.textContent = yearLines.map((track) => track.label).join(' · ');
      item.append(trackList);
    }
    if (options.mode === 'edit') {
      const menuItems: CardMenuItem[] = [];
      if (index > 0) {
        menuItems.push({
          id: 'left',
          label: 'Move left',
          onSelect: () => options.handlers.onMove(line.id, -1)
        });
      }
      if (index < options.lines.length - 1) {
        menuItems.push({
          id: 'right',
          label: 'Move right',
          onSelect: () => options.handlers.onMove(line.id, 1)
        });
      }
      menuItems.push({
        id: 'year-line',
        label: missingStandardYearTracks(line).length ? 'Add year line' : 'Add extra year line',
        onSelect: () => options.handlers.onAddYearLine(line)
      });
      item.append(renderCardMenu(`${line.name} Line menu`, menuItems, { heading: 'Line', inline: true }));
    }
    key.append(item);
  }
  return key;
}
