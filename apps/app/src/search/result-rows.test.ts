import { describe, expect, it } from 'vitest';
import type { SearchEntry } from '@smarteverything/domain';
import type { NodeItem, ResultNode } from './nodes';
import { defaultResultIndex, NO_EXPANSION, suggestionRows, treeRows } from './result-rows';

function entry(title: string): SearchEntry {
  return {
    id: title,
    group: 'page',
    title,
    detail: '',
    keywords: [],
    state: null,
    openLabel: 'Open',
    suggested: false,
    open: { kind: 'room', roomId: 'room' },
    run: null,
    runLabel: null,
  };
}

function result(
  title: string,
  hit: boolean,
  children: readonly ResultNode[] = [],
  item: NodeItem = { kind: 'entry', entry: entry(title), title },
): ResultNode {
  return { key: title, item, score: 1, hit, found: children.length > 0, range: null, children };
}

function pages(...roots: readonly ResultNode[]): ReturnType<typeof treeRows> {
  return treeRows([{ group: 'pages', label: 'Pages', roots }], NO_EXPANSION);
}

describe('the default Search result', () => {
  it('opens the matching page instead of its contextual ancestors', () => {
    const privacy = result('Privacy policy', true);
    const rows = pages(result('Settings', false, [result('About', false, [privacy])]));
    expect(rows[defaultResultIndex(rows)]?.key).toBe(privacy.key);
  });

  it('does not default to a command when a matching destination is visible', () => {
    const command = result('Turn on', true, [], {
      kind: 'phrase',
      deviceId: 'lamp',
      entry: entry('Turn on'),
      phrase: 'Turn on',
    });
    const lamp = result('Lamp', false, [command]);
    const destination = result('Device settings', true);
    const rows = pages(lamp, destination);
    expect(rows[defaultResultIndex(rows)]?.key).toBe(destination.key);
  });

  it('still starts on the first suggestion before a query is typed', () => {
    const rows = suggestionRows({ recent: ['Privacy'], favourites: [], rooms: [], tries: [] });
    expect(rows[defaultResultIndex(rows)]?.key).toBe('recent:Privacy');
  });
});
