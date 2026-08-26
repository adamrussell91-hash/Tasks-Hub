import {
  TASK_PROPERTY_LIST_KEYS,
  validateTaskPropertyConfig,
  type PropertyOption,
  type TaskPropertyConfig,
  type TaskPropertyListKey
} from '@/schemas/task-properties';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { loadTaskProperties, saveTaskProperties } from '@/services/task-properties';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { createHubField, createHubToolbar, el } from '@/views/hub-kit';

const SECTION_META: Record<
  TaskPropertyListKey,
  { title: string; supporting: string; color?: boolean }
> = {
  domains: {
    title: 'Domains',
    supporting: 'Life areas — drive filters, Today focus, and Universe planets.',
    color: true
  },
  priorities: {
    title: 'Urgency / priority',
    supporting: 'How urgent work is ranked in lists and pinch cues.'
  },
  statuses: {
    title: 'Statuses',
    supporting: 'Where a task sits on the board and in filters.'
  },
  kinds: {
    title: 'Kinds',
    supporting: 'Task vs checklist step — usually leave as task and step.'
  },
  buckets: {
    title: 'Buckets',
    supporting: 'Active work vs Someday / Maybe parking.'
  },
  sources: {
    title: 'Sources',
    supporting: 'How the task entered the system.'
  },
  tags: {
    title: 'Tag vocabulary',
    supporting:
      'Suggested tags for pickers. Tasks can still use any tag text — this list powers suggestions.'
  }
};

function slugify(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'item';
}

function cloneConfig(config: TaskPropertyConfig): TaskPropertyConfig {
  return structuredClone(config);
}

function moveOption(list: PropertyOption[], index: number, delta: number): PropertyOption[] {
  const next = [...list];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  if (!item) return next;
  next.splice(target, 0, item);
  return next;
}

export async function renderPropertiesView(canvas: HTMLElement): Promise<void> {
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  let draft: TaskPropertyConfig;
  try {
    draft = cloneConfig(await loadTaskProperties(true));
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPropertiesView(canvas), 'Could not load properties');
    return;
  }

  const statusHost = el('div', 'property-status');
  const sectionsHost = el('div', 'property-sections');

  const renderOptionRow = (
    section: TaskPropertyListKey,
    option: PropertyOption,
    index: number
  ): HTMLElement => {
    const row = el('article', 'task-row property-row');
    const fields = el('div', 'property-row__fields hub-toolbar');

    const label = createHubField({
      ariaLabel: `${SECTION_META[section].title} label`,
      value: option.label,
      placeholder: 'Label'
    });
    label.input.addEventListener('input', () => {
      draft[section][index] = { ...draft[section][index]!, label: label.input.value };
    });

    const id = createHubField({
      ariaLabel: `${SECTION_META[section].title} id`,
      value: option.id,
      placeholder: 'id'
    });
    id.input.addEventListener('input', () => {
      draft[section][index] = { ...draft[section][index]!, id: id.input.value };
    });

    fields.append(label.el, id.el);

    if (SECTION_META[section].color) {
      const color = createHubField({
        type: 'color',
        ariaLabel: `${SECTION_META[section].title} colour`,
        value: option.color ?? '#244f7c'
      });
      color.input.addEventListener('input', () => {
        draft[section][index] = { ...draft[section][index]!, color: color.input.value };
      });
      fields.append(color.el);
    }

    const actions = el('div', 'task-row__actions');
    const up = el('button', 'btn btn--ghost', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', () => {
      draft[section] = moveOption(draft[section], index, -1);
      paintSections();
    });

    const down = el('button', 'btn btn--ghost', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.disabled = index === draft[section].length - 1;
    down.addEventListener('click', () => {
      draft[section] = moveOption(draft[section], index, 1);
      paintSections();
    });

    const remove = el('button', 'btn btn--ghost', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      if (draft[section].length <= 1 && section !== 'tags') return;
      draft[section] = draft[section].filter((_, rowIndex) => rowIndex !== index);
      paintSections();
    });

    actions.append(up, down, remove);
    row.append(fields, actions);
    return row;
  };

  const paintSections = () => {
    sectionsHost.replaceChildren();
    for (const section of TASK_PROPERTY_LIST_KEYS) {
      const block = el('section', 'property-section');
      const meta = SECTION_META[section];
      block.append(el('h2', 'section-title', meta.title));
      block.append(el('p', 'view-lede', meta.supporting));

      const stack = el('div', 'task-stack');
      if (!draft[section].length) {
        stack.append(el('p', 'empty-state', 'No entries yet.'));
      } else {
        for (let index = 0; index < draft[section].length; index++) {
          stack.append(renderOptionRow(section, draft[section][index]!, index));
        }
      }

      const add = el('button', 'btn btn--secondary', 'Add');
      add.type = 'button';
      add.addEventListener('click', () => {
        const label = section === 'tags' ? 'new tag' : 'new item';
        const id = slugify(label);
        draft[section] = [
          ...draft[section],
          { id, label, ...(meta.color ? { color: '#244f7c' } : {}) }
        ];
        statusHost.replaceChildren();
        paintSections();
      });

      block.append(stack, add);
      sectionsHost.append(block);
    }
  };

  canvas.replaceChildren();
  const toolbar = createHubToolbar('property-toolbar');
  const save = el('button', 'btn btn--primary', 'Save properties');
  save.type = 'button';
  const reset = el('button', 'btn btn--ghost', 'Reset to defaults');
  reset.type = 'button';

  save.addEventListener('click', () => {
    statusHost.replaceChildren();
    save.disabled = true;
    try {
      const parsed = validateTaskPropertyConfig(draft);
      void saveTaskProperties(parsed)
        .then((saved) => {
          draft = cloneConfig(saved);
          paintSections();
          statusHost.append(el('p', 'empty-state', 'Saved.'));
        })
        .catch((err) => {
          statusHost.append(el('p', 'empty-state', errorMessage(err)));
        })
        .finally(() => {
          save.disabled = false;
        });
    } catch (err) {
      statusHost.append(el('p', 'empty-state', errorMessage(err)));
      save.disabled = false;
    }
  });

  reset.addEventListener('click', () => {
    draft = cloneConfig(DEFAULT_TASK_PROPERTY_CONFIG);
    paintSections();
    statusHost.replaceChildren();
    statusHost.append(el('p', 'empty-state', 'Draft reset — click Save to persist.'));
  });

  toolbar.append(save, reset);
  canvas.append(toolbar, statusHost, sectionsHost);
  paintSections();
}
