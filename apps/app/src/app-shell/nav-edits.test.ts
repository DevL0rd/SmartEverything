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
  hideSection,
  itemsOf,
  moveIntoFolder,
  moveOutOfFolder,
  removeNode,
  renameNode,
  reorder,
  reorderMembers,
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

  it('creates an empty folder at the end', () => {
    expect(keys(createFolder([pin('a')], folder('f'), []))).toEqual(['a', 'f']);
  });

  it('moves an item into a folder and out again, right after the folder', () => {
    const items = createFolder([pin('a'), pin('b'), pin('c')], folder('f'), ['a']);
    const into = moveIntoFolder(items, 'c', 'f');
    expect(keys(into)).toEqual(['f', 'b']);
    const out = moveOutOfFolder(into, 'a');
    expect(keys(out)).toEqual(['f', 'a', 'b']);
    expect(out[0]).toMatchObject({ items: [{ id: 'c' }] });
  });

  it('moves an item from one folder to another', () => {
    const items = createFolder(
      createFolder([pin('a'), pin('b')], folder('f'), ['a']),
      folder('g'),
      ['b'],
    );
    const next = moveIntoFolder(items, 'a', 'g');
    expect(next[0]).toMatchObject({ id: 'f', items: [] });
    expect(next[1]).toMatchObject({ id: 'g', items: [{ id: 'b' }, { id: 'a' }] });
  });

  it('reorders inside a folder', () => {
    const items = createFolder([pin('a'), pin('b'), pin('c')], folder('f'), ['a', 'b', 'c']);
    const next = reorderMembers(items, 'f', ['c', 'a', 'b']);
    expect(next[0]).toMatchObject({ items: [{ id: 'c' }, { id: 'a' }, { id: 'b' }] });
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
