import { describe, expect, it } from 'vitest';
import type { BoardWidget, WidgetSize } from '@smarteverything/domain';
import type { GalleryEntry, TargetRow, WidgetDefinition } from '../types';
import { added, sizeOptions } from './edit-model';
import {
  entrySize,
  galleryGroups,
  galleryItems,
  suggestionsOf,
  targetGroups,
  type Suggestion,
} from './gallery-model';

const NOTHING = { devices: [], rooms: [], groups: [] } as const;

const ALL: readonly WidgetSize[] = ['M', 'W', 'XL'];

function definitionOf(
  type: string,
  extra: Partial<Pick<WidgetDefinition, 'entries' | 'group' | 'defaultSize' | 'sizes'>> = {},
): WidgetDefinition {
  return {
    type,
    title: type,
    icon: 'bulb',
    sizes: { compact: ALL, medium: ALL, expanded: ALL },
    defaultSize: 'M',
    render: (): null => null,
    ...extra,
  };
}

function entryOf(title: string, group: string, extra: Partial<GalleryEntry> = {}): GalleryEntry {
  return { title, subtitle: `${title} subtitle`, icon: 'bulb', group, ...extra };
}

const PICK = { title: 'Choose light', sections: (): readonly [] => [] };

const SPOTLIGHT = definitionOf('spotlight', {
  entries: [
    entryOf('Light', 'Lights', { pick: PICK }),
    entryOf('Device', 'Devices', { pick: PICK }),
  ],
});

const PLAIN = definitionOf('weather', { group: 'Home' });

function placedOf(type: string, key: string = type): BoardWidget {
  return { key, type, size: 'M' };
}

describe('galleryItems', () => {
  it('presents one item per entry of a definition', () => {
    const items = galleryItems([SPOTLIGHT], [], 'compact');
    expect(items.map((item) => item.entry.title)).toStrictEqual(['Light', 'Device']);
    expect(items.map((item) => item.id)).toStrictEqual(['spotlight:0', 'spotlight:1']);
  });

  it('presents a definition without entries as one item listing its sizes', () => {
    const [item] = galleryItems([PLAIN], [], 'compact');
    expect(item?.entry).toMatchObject({
      title: 'weather',
      group: 'Home',
      subtitle: 'Medium · Extra large',
    });
  });

  it('files a definition without a group under More widgets', () => {
    const [item] = galleryItems([definitionOf('notes')], [], 'compact');
    expect(item?.entry.group).toBe('More widgets');
  });

  it('hides a plain widget once it is placed', () => {
    expect(galleryItems([PLAIN], [placedOf('weather')], 'compact')).toHaveLength(0);
  });

  it('keeps entries that pick a target available after one is placed', () => {
    const items = galleryItems([SPOTLIGHT], [placedOf('spotlight')], 'compact');
    expect(items).toHaveLength(2);
  });
});

describe('galleryGroups', () => {
  const items = galleryItems(
    [PLAIN, SPOTLIGHT, definitionOf('notes'), definitionOf('rig', { group: 'Network' })],
    [],
    'compact',
  );

  it('orders Lights, Devices, Home, other named groups, then More widgets', () => {
    expect(galleryGroups(items, '').map((group) => group.title)).toStrictEqual([
      'Lights',
      'Devices',
      'Home',
      'Network',
      'More widgets',
    ]);
  });

  it('filters by title, subtitle or group and drops empty groups', () => {
    const groups = galleryGroups(items, 'light');
    expect(groups.map((group) => group.title)).toStrictEqual(['Lights']);
    expect(groups[0]?.items.map((item) => item.entry.title)).toStrictEqual(['Light']);
  });

  it('finds nothing for a query that matches no entry', () => {
    expect(galleryGroups(items, 'zzz')).toStrictEqual([]);
  });
});

describe('size choices', () => {
  it('hides wide on a phone board where it repeats medium', () => {
    expect(sizeOptions(definitionOf('a'), 'compact').map((option) => option.size)).toStrictEqual([
      'M',
      'XL',
    ]);
  });

  it.each(['medium', 'expanded'] as const)(
    'offers every distinct shape on the %s board',
    (board) => {
      expect(sizeOptions(definitionOf('a'), board).map((option) => option.size)).toStrictEqual(ALL);
    },
  );

  it('offers only the sizes the definition allows', () => {
    const only = definitionOf('a', {
      sizes: { compact: ['M'], medium: ['M', 'W'], expanded: ['M'] },
    });
    expect(sizeOptions(only, 'compact').map((option) => option.size)).toStrictEqual(['M']);
    expect(sizeOptions(only, 'medium').map((option) => option.size)).toStrictEqual(['M', 'W']);
  });
});

describe('entrySize', () => {
  it('uses the entry default when the board allows it', () => {
    const item = galleryItems(
      [definitionOf('g', { entries: [entryOf('Group', 'Lights', { defaultSize: 'XL' })] })],
      [],
      'compact',
    )[0];
    expect(item === undefined ? null : entrySize(item, 'compact')).toBe('XL');
  });

  it('falls back to the definition default when the entry default is not allowed', () => {
    const limited = definitionOf('g', {
      sizes: { compact: ['M'], medium: ['M'], expanded: ['M'] },
      entries: [entryOf('Group', 'Lights', { defaultSize: 'XL' })],
    });
    const item = galleryItems([limited], [], 'compact')[0];
    expect(item === undefined ? null : entrySize(item, 'compact')).toBe('M');
  });
});

describe('suggestionsOf', () => {
  const rowsOf = (...keys: readonly string[]): readonly TargetRow[] =>
    keys.map((key) => ({ key, title: key, subtitle: key, options: { key } }));
  const suggesting = (type: string, ...keys: readonly string[]): WidgetDefinition =>
    definitionOf(type, {
      entries: [entryOf(type, 'Lights', { pick: { ...PICK, suggestions: () => rowsOf(...keys) } })],
    });
  const keysOf = (suggestions: readonly Suggestion[]): readonly string[] =>
    suggestions.map(({ row }) => row.key);

  it('collects at most four suggested rows across entries', () => {
    const items = galleryItems(
      [suggesting('a', 'a1', 'a2', 'a3'), suggesting('b', 'b1', 'b2', 'b3')],
      [],
      'compact',
    );
    expect(suggestionsOf(items, NOTHING, [])).toHaveLength(4);
  });

  it('takes turns between entries so one kind cannot fill the list', () => {
    const items = galleryItems(
      [suggesting('a', 'a1', 'a2', 'a3', 'a4'), suggesting('b', 'b1'), suggesting('c', 'c1')],
      [],
      'compact',
    );
    expect(keysOf(suggestionsOf(items, NOTHING, []))).toStrictEqual(['a1', 'b1', 'c1', 'a2']);
  });

  it('leaves out targets already on the page', () => {
    const items = galleryItems([suggesting('a', 'a1', 'a2')], [], 'compact');
    const placed: BoardWidget = { key: 'a', type: 'a', size: 'M', options: { key: 'a1' } };
    expect(keysOf(suggestionsOf(items, NOTHING, [placed]))).toStrictEqual(['a2']);
  });

  it('suggests nothing from entries without suggestions', () => {
    expect(suggestionsOf(galleryItems([SPOTLIGHT], [], 'compact'), NOTHING, [])).toStrictEqual([]);
  });
});

describe('targetGroups', () => {
  const sections = [
    {
      title: 'Living room',
      rows: [
        { key: 'a', title: 'Floor lamp', subtitle: 'Living room', options: { id: 'a' } },
        { key: 'b', title: 'Ceiling', subtitle: 'Living room', options: { id: 'b' } },
      ],
    },
    {
      title: 'Study',
      rows: [{ key: 'c', title: 'Nook', subtitle: 'Study', options: { id: 'c' } }],
    },
  ];

  it('marks targets already on the page by their stored options', () => {
    const placed: BoardWidget = {
      key: 'spotlight',
      type: 'spotlight',
      size: 'M',
      options: { id: 'b' },
    };
    const groups = targetGroups(sections, [placed], '');
    expect(groups[0]?.rows.map((row) => row.onPage)).toStrictEqual([false, true]);
  });

  it('filters rows by the query and drops sections left empty', () => {
    const groups = targetGroups(sections, [], 'nook');
    expect(groups.map((group) => group.title)).toStrictEqual(['Study']);
  });
});

describe('added', () => {
  it('places the picked options on a new widget and keeps earlier copies', () => {
    const first = added([], 'spotlight', 'M', { id: 'a' });
    const second = added(first, 'spotlight', 'XL', { id: 'b' });
    expect(second.map((widget) => widget.key)).toStrictEqual(['spotlight', 'spotlight:2']);
    expect(second.at(-1)).toMatchObject({ size: 'XL', options: { id: 'b' } });
  });

  it('adds no options key when none are picked', () => {
    expect(added([], 'weather', 'M')[0]).toStrictEqual({
      key: 'weather',
      type: 'weather',
      size: 'M',
    });
  });
});
