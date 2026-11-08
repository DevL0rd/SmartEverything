import { describe, expect, it } from 'vitest';
import { count } from '../../../format/number';
import { countText, libraryLayoutOf, libraryRailWidthOf, railGroupsOf } from './sections';

describe('library sections', () => {
  it('formats numeric counts, keeps text counts and drops empty ones', () => {
    expect(countText(48213)).toBe(count(48213));
    expect(countText('7 days')).toBe('7 days');
    expect(countText(null)).toBeUndefined();
    expect(countText('')).toBeUndefined();
  });

  it('turns page groups into kit rail groups with trailing counts and nothing missing', () => {
    const groups = railGroupsOf([
      {
        title: null,
        sections: [{ id: 'index', label: 'Timeline', icon: 'image', count: 12 }],
      },
      {
        title: 'Library',
        sections: [
          { id: 'insights', label: 'Insights', icon: 'folder', count: null },
          { id: 'deleted', label: 'Recently deleted', short: 'Deleted', icon: 'trash', count: 4 },
        ],
      },
    ]);
    expect(groups.map((group) => group.title)).toEqual([null, 'Library']);
    expect(groups[0]?.entries[0]).toEqual({
      id: 'index',
      label: 'Timeline',
      short: undefined,
      icon: 'image',
      missing: null,
      detail: null,
      count: '12',
    });
    expect(groups[1]?.entries.map((entry) => entry.count)).toEqual([undefined, '4']);
    expect(groups[1]?.entries[1]?.short).toBe('Deleted');
  });

  it('passes a section detail line through to its rail entry', () => {
    const groups = railGroupsOf([
      {
        title: null,
        sections: [
          { id: 'sync', label: 'Sync', icon: 'folderSync', count: null, detail: 'In sync' },
        ],
      },
    ]);
    expect(groups[0]?.entries[0]?.detail).toBe('In sync');
  });

  it('uses no rail on phones, the icon rail on tablets and the wide rail on desktops', () => {
    expect(libraryLayoutOf(412)).toBe('compact');
    expect(libraryLayoutOf(768)).toBe('icon');
    expect(libraryRailWidthOf(768)).toBe('icon');
    expect(libraryLayoutOf(1280)).toBe('wide');
    expect(libraryRailWidthOf(1280)).toBe('wide');
    expect(libraryRailWidthOf(960)).toBe('mid');
  });
});
