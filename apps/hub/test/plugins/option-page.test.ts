import { PLUGIN_OPTION_PAGE_MAX, type PluginOption } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { optionPage } from '../../src/plugins/builtin/automation-kit-pages';

function option(id: string, label: string, detail: string | null = null): PluginOption {
  return { id, label, detail, color: null, image: null };
}

const MANY: readonly PluginOption[] = Array.from(
  { length: PLUGIN_OPTION_PAGE_MAX + 3 },
  (_, index) => option(`o${String(index)}`, `Option ${String(index)}`),
);

describe('optionPage', () => {
  it('pages the options and hands out a cursor until the last page', () => {
    const first = optionPage(MANY, {});
    expect(first.state === 'ready' && first.options).toHaveLength(PLUGIN_OPTION_PAGE_MAX);
    const cursor = first.state === 'ready' ? first.next : null;
    expect(cursor).toBe(String(PLUGIN_OPTION_PAGE_MAX));
    const last = optionPage(MANY, cursor === null ? {} : { after: cursor });
    expect(last).toMatchObject({ state: 'ready', next: null });
    expect(last.state === 'ready' && last.options.map((found) => found.id)).toEqual([
      `o${String(PLUGIN_OPTION_PAGE_MAX)}`,
      `o${String(PLUGIN_OPTION_PAGE_MAX + 1)}`,
      `o${String(PLUGIN_OPTION_PAGE_MAX + 2)}`,
    ]);
  });

  it('starts from the beginning when the cursor is not a position', () => {
    expect(optionPage(MANY, { after: 'garbage' })).toEqual(optionPage(MANY, {}));
    expect(optionPage(MANY, { after: '-4' })).toEqual(optionPage(MANY, {}));
  });

  it('searches the label, the detail and the id without caring about case', () => {
    const options = [
      option('lamp-1', 'Lamp', 'Living room'),
      option('fan-2', 'Fan', 'Bedroom'),
      option('zed', 'Other'),
    ];
    const ids = (q: string): readonly string[] => {
      const page = optionPage(options, { q });
      return page.state === 'ready' ? page.options.map((found) => found.id) : [];
    };
    expect(ids('LAMP')).toEqual(['lamp-1']);
    expect(ids('bedroom')).toEqual(['fan-2']);
    expect(ids('zed')).toEqual(['zed']);
    expect(ids('')).toEqual(['lamp-1', 'fan-2', 'zed']);
  });

  it('answers listed ids in one page, skipping the ones it does not know', () => {
    const options = [option('a', 'A'), option('b', 'B'), option('c', 'C')];
    expect(optionPage(options, { ids: 'c,missing,a,' })).toEqual({
      state: 'ready',
      options: [options[0], options[2]],
      next: null,
    });
  });
});
