import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_LAYOUT,
  navNodeKey,
  type NavFolder,
  type NavNode,
  type NavPin,
  type NavigationLayout,
} from '@smarteverything/domain';
import {
  appendPin,
  createFolder,
  foldTogether,
  hideSection,
  itemsOf,
  placeNode,
  removeNode,
  renameNode,
  reorder,
  setNodeIcon,
  showSection,
  ungroupFolder,
  withItems,
} from './nav-edits';

const DEVICE = '11111111-1111-4111-8111-111111111111';

const pin = (id: string): NavPin => ({
  kind: 'pin',
  id,
  target: { kind: 'device', deviceId: DEVICE, focus: null },
  title: null,
  icon: null,
});

const keys = (items: readonly NavNode[]): readonly string[] => items.map(navNodeKey);

const DEFAULT: NavigationLayout = { items: null, hidden: [] };

describe('editing the navigation', () => {
  it('starts from the default order when nothing is saved', () => {
    expect(keys(itemsOf(DEFAULT))).toEqual([
      'section:home',
      'section:devices',
      'section:cameras',
      'section:fitness',
      'section:assistant',
      'section:talk',
      'section:automations',
    ]);
  });

  it('appends a pin at the end', () => {
    expect(keys(appendPin(itemsOf(DEFAULT), pin('lamp'))).at(-1)).toBe('lamp');
  });

  it('removes a pin from the top level and from a folder', () => {
    const items = [pin('a'), createFolder([pin('b'), pin('c')], folder('f'), ['b', 'c'])].flat();
    expect(keys(removeNode(items, 'a'))).toEqual(['f']);
    const inside = removeNode(items, 'b');
    expect(inside.find((node) => node.kind === 'folder')).toMatchObject({
      items: [{ id: 'c' }],
    });
  });

  it('reorders the shown items and leaves the hidden ones where they are', () => {
    const items = itemsOf(DEFAULT);
    const next = reorder(items, ['section:fitness', 'section:home', 'section:automations']);
    expect(keys(next)).toEqual([
      'section:fitness',
      'section:devices',
      'section:cameras',
      'section:home',
      'section:assistant',
      'section:talk',
      'section:automations',
    ]);
  });

  it('keeps the whole list when the order did not change', () => {
    const items = itemsOf(DEFAULT);
    expect(keys(reorder(items, keys(items)))).toEqual(keys(items));
  });

  it('creates a folder where its first member was and takes the members into it', () => {
    const items = [pin('a'), pin('b'), pin('c'), pin('d')];
    const next = createFolder(items, folder('f'), ['b', 'd']);
    expect(keys(next)).toEqual(['a', 'f', 'c']);
    expect(next[1]).toMatchObject({ kind: 'folder', items: [{ id: 'b' }, { id: 'd' }] });
  });

  it('folds two items into a new folder at the target position', () => {
    const items = [pin('a'), pin('b'), pin('c'), pin('d')];
    const forward = foldTogether(items, folder('f'), 'a', 'c');
    expect(keys(forward)).toEqual(['b', 'f', 'd']);
    expect(forward[1]).toMatchObject({ kind: 'folder', items: [{ id: 'c' }, { id: 'a' }] });
    const backward = foldTogether(items, folder('f'), 'd', 'b');
    expect(keys(backward)).toEqual(['a', 'f', 'c']);
    expect(backward[1]).toMatchObject({ items: [{ id: 'b' }, { id: 'd' }] });
  });

  it('folds an item that sits inside another folder', () => {
    const items = [pin('a'), pin('b'), pin('c')];
    const grouped = createFolder(items, folder('g'), ['b', 'c']);
    const next = foldTogether(grouped, folder('f'), 'c', 'a');
    expect(keys(next)).toEqual(['f', 'g']);
    expect(next[0]).toMatchObject({ items: [{ id: 'a' }, { id: 'c' }] });
    expect(next[1]).toMatchObject({ items: [{ id: 'b' }] });
  });

  it('leaves the items alone for a folder, a missing key or the same item', () => {
    const grouped = createFolder([pin('a'), pin('b')], folder('g'), ['b']);
    expect(foldTogether(grouped, folder('f'), 'a', 'g')).toBe(grouped);
    expect(foldTogether(grouped, folder('f'), 'g', 'a')).toBe(grouped);
    expect(foldTogether(grouped, folder('f'), 'a', 'zzz')).toBe(grouped);
    expect(foldTogether(grouped, folder('f'), 'a', 'a')).toBe(grouped);
  });

  it('creates an empty folder at the end', () => {
    expect(keys(createFolder([pin('a')], folder('f'), []))).toEqual(['a', 'f']);
  });

  it('renames a pin or a folder and changes their icon', () => {
    const items = createFolder([pin('a'), pin('b')], folder('f'), ['b']);
    const renamed = renameNode(renameNode(items, 'a', 'Lamp'), 'f', 'Rooms');
    expect(renamed[0]).toMatchObject({ id: 'a', title: 'Lamp' });
    expect(renamed[1]).toMatchObject({ id: 'f', title: 'Rooms' });
    const iconed = setNodeIcon(setNodeIcon(renamed, 'a', 'bed'), 'f', 'sofa');
    expect(iconed[0]).toMatchObject({ icon: 'bed' });
    expect(iconed[1]).toMatchObject({ icon: 'sofa' });
  });

  it('renames and re-icons a pin that sits in a folder', () => {
    const items = createFolder([pin('a')], folder('f'), ['a']);
    const next = setNodeIcon(renameNode(items, 'a', 'Lamp'), 'a', 'moon');
    expect(next[0]).toMatchObject({ items: [{ id: 'a', title: 'Lamp', icon: 'moon' }] });
  });

  it('ungroups a folder keeping its pins in its place, or dropping the pins but keeping sections', () => {
    const items = createFolder([pin('a'), { kind: 'section', section: 'talk' }], folder('f'), [
      'a',
      'section:talk',
    ]);
    expect(keys(ungroupFolder(items, 'f', true))).toEqual(['a', 'section:talk']);
    expect(keys(ungroupFolder(items, 'f', false))).toEqual(['section:talk']);
  });

  it('hides and shows a section without touching the order', () => {
    const hidden = hideSection(DEFAULT, 'talk');
    expect(hidden.hidden).toEqual(['talk']);
    expect(hideSection(hidden, 'talk')).toBe(hidden);
    expect(showSection(hidden, 'talk').hidden).toEqual([]);
  });

  describe('placing a node', () => {
    const base = (): NavNode[] =>
      createFolder([pin('a'), pin('b'), pin('c'), pin('d')], folder('f'), ['b', 'c']);

    it('moves a top-level node before another or to the end', () => {
      expect(keys(placeNode(base(), 'd', { parent: null, before: 'a' }))).toEqual(['d', 'a', 'f']);
      expect(keys(placeNode(base(), 'a', { parent: null, before: null }))).toEqual(['f', 'd', 'a']);
    });

    it('moves a top-level node into a folder at a position', () => {
      const moved = placeNode(base(), 'a', { parent: 'f', before: 'c' });
      expect(keys(moved)).toEqual(['f', 'd']);
      expect(keys(moved.flatMap((node) => (node.kind === 'folder' ? node.items : [])))).toEqual([
        'b',
        'a',
        'c',
      ]);
    });

    it('moves a member out of its folder to a top-level position', () => {
      const moved = placeNode(base(), 'b', { parent: null, before: 'a' });
      expect(keys(moved)).toEqual(['b', 'a', 'f', 'd']);
      expect(moved.flatMap((node) => (node.kind === 'folder' ? keys(node.items) : []))).toEqual([
        'c',
      ]);
    });

    it('reorders members inside their folder', () => {
      const moved = placeNode(base(), 'c', { parent: 'f', before: 'b' });
      expect(moved.flatMap((node) => (node.kind === 'folder' ? keys(node.items) : []))).toEqual([
        'c',
        'b',
      ]);
    });

    it('never puts a folder inside a folder and ignores unknown keys', () => {
      const items = createFolder(base(), folder('g'), ['a']);
      expect(placeNode(items, 'g', { parent: 'f', before: null })).toBe(items);
      expect(placeNode(items, 'nothing', { parent: null, before: null })).toBe(items);
    });
  });

  it('gives a pin back its live name when renamed to null and keeps a folder name', () => {
    const items = createFolder([pin('a'), pin('b')], folder('f'), ['b']);
    const named = renameNode(items, 'a', 'Lamp');
    expect(named[0]).toMatchObject({ title: 'Lamp' });
    expect(renameNode(named, 'a', null)[0]).toMatchObject({ title: null });
    expect(renameNode(items, 'f', null)).toEqual(items);
  });

  it('only builds layouts the schema accepts', () => {
    const items = createFolder(appendPin(itemsOf(DEFAULT), pin('lamp')), folder('f'), [
      'lamp',
      'section:talk',
    ]);
    const layout = hideSection(withItems(DEFAULT, items), 'cameras');
    expect(NAVIGATION_LAYOUT.safeParse(layout).success).toBe(true);
  });
});

function folder(id: string): Pick<NavFolder, 'id' | 'title' | 'icon'> {
  return { id, title: id, icon: 'folder' };
}
