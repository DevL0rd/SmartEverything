import { describe, expect, it } from 'vitest';
import { PLUGIN_OPTION_IDS_MAX, type PluginOptionPage } from '@smarteverything/domain';
import { idChunks, readChosen } from './chosen-pages';

function option(id: string): PluginOptionPage {
  return {
    state: 'ready',
    options: [{ id, label: id, detail: null, color: null, image: null }],
    next: null,
  };
}

describe('chosen option lookup', () => {
  it('splits the chosen ids into requests the hub accepts', () => {
    const ids = Array.from({ length: PLUGIN_OPTION_IDS_MAX * 2 + 1 }, (_, index) => String(index));
    const chunks = idChunks(ids);
    expect(chunks.map((chunk) => chunk.split(',').length)).toEqual([
      PLUGIN_OPTION_IDS_MAX,
      PLUGIN_OPTION_IDS_MAX,
      1,
    ]);
  });

  it('joins every chunk into one list so no chosen name is dropped', async () => {
    const ids = Array.from({ length: PLUGIN_OPTION_IDS_MAX + 2 }, (_, index) => String(index));
    const page = await readChosen(
      (query) => Promise.resolve(option(String(query.ids?.split(',')[0]))),
      ids,
    );
    expect(page.state === 'ready' ? page.options.map((entry) => entry.id) : []).toEqual([
      '0',
      String(PLUGIN_OPTION_IDS_MAX),
    ]);
  });

  it('reports the plugin as unavailable when any chunk is', async () => {
    const ids = Array.from({ length: PLUGIN_OPTION_IDS_MAX + 1 }, (_, index) => String(index));
    const page = await readChosen(
      (query) =>
        Promise.resolve(
          query.ids === String(PLUGIN_OPTION_IDS_MAX)
            ? { state: 'unavailable', message: 'Not connected' }
            : option('0'),
        ),
      ids,
    );
    expect(page.state).toBe('unavailable');
  });
});
