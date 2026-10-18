import {
  defaultNavigationItems,
  navNodeKey,
  type NavEntry,
  type NavFolder,
  type NavIcon,
  type NavNode,
  type NavPin,
  type NavSection,
  type NavigationLayout,
} from '@smarteverything/domain';

export type NavItems = readonly NavNode[];

export function itemsOf(layout: NavigationLayout): NavItems {
  return layout.items ?? defaultNavigationItems();
}

export function withItems(layout: NavigationLayout, items: NavItems): NavigationLayout {
  return { ...layout, items };
}

function isEntry(node: NavNode): node is NavEntry {
  return node.kind !== 'folder';
}

function entryOfKey(items: NavItems, key: string): NavEntry | null {
  for (const node of items) {
    if (isEntry(node) && navNodeKey(node) === key) return node;
    if (node.kind === 'folder') {
      const member = node.items.find((entry) => navNodeKey(entry) === key);
      if (member !== undefined) return member;
    }
  }
  return null;
}

function withoutEntry(items: NavItems, key: string): NavItems {
  return items.flatMap((node): readonly NavNode[] => {
    if (node.kind === 'folder') {
      return [{ ...node, items: node.items.filter((entry) => navNodeKey(entry) !== key) }];
    }
    return navNodeKey(node) === key ? [] : [node];
  });
}

export function appendPin(items: NavItems, pin: NavPin): NavItems {
  return [...items, pin];
}

export function removeNode(items: NavItems, key: string): NavItems {
  return withoutEntry(items, key).filter((node) => navNodeKey(node) !== key);
}

function reordered<T>(
  list: readonly T[],
  keyOf: (item: T) => string,
  visible: readonly string[],
): readonly T[] {
  const shown = new Set(visible);
  const byKey = new Map(list.map((item) => [keyOf(item), item]));
  const order = visible.flatMap((key) => byKey.get(key) ?? []);
  let next = 0;
  return list.map((item) => (shown.has(keyOf(item)) ? (order[next++] ?? item) : item));
}

export function reorder(items: NavItems, visible: readonly string[]): NavItems {
  return reordered(items, navNodeKey, visible);
}

export function reorderMembers(
  items: NavItems,
  folderId: string,
  visible: readonly string[],
): NavItems {
  return items.map((node) =>
    node.kind === 'folder' && node.id === folderId
      ? { ...node, items: reordered(node.items, navNodeKey, visible) }
      : node,
  );
}

export function moveIntoFolder(items: NavItems, key: string, folderId: string): NavItems {
  const entry = entryOfKey(items, key);
  if (entry === null) return items;
  return withoutEntry(items, key).map((node) =>
    node.kind === 'folder' && node.id === folderId
      ? { ...node, items: [...node.items, entry] }
      : node,
  );
}

export function moveOutOfFolder(items: NavItems, key: string): NavItems {
  const folder = items.find(
    (node): node is NavFolder =>
      node.kind === 'folder' && node.items.some((entry) => navNodeKey(entry) === key),
  );
  const entry = entryOfKey(items, key);
  if (folder === undefined || entry === null) return items;
  return withoutEntry(items, key).flatMap((node) =>
    node.kind === 'folder' && node.id === folder.id ? [node, entry] : [node],
  );
}

export function createFolder(
  items: NavItems,
  folder: Pick<NavFolder, 'id' | 'title' | 'icon'>,
  members: readonly string[],
): NavItems {
  const entries = members.flatMap((key) => entryOfKey(items, key) ?? []);
  const created: NavFolder = { kind: 'folder', ...folder, items: entries };
  const result: NavNode[] = [];
  let placed = false;
  for (const node of items) {
    if (!members.includes(navNodeKey(node))) {
      result.push(node.kind === 'folder' ? stripped(node, members) : node);
    } else if (!placed) {
      result.push(created);
      placed = true;
    }
  }
  return placed ? result : [...result, created];
}

function stripped(folder: NavFolder, members: readonly string[]): NavFolder {
  return { ...folder, items: folder.items.filter((entry) => !members.includes(navNodeKey(entry))) };
}

export function renameNode(items: NavItems, key: string, title: string): NavItems {
  return items.map((node) => {
    if (node.kind === 'folder' && node.id === key) return { ...node, title };
    if (node.kind === 'pin' && node.id === key) return { ...node, title };
    if (node.kind !== 'folder') return node;
    return { ...node, items: node.items.map((entry) => renamedEntry(entry, key, title)) };
  });
}

function renamedEntry(entry: NavEntry, key: string, title: string): NavEntry {
  return entry.kind === 'pin' && entry.id === key ? { ...entry, title } : entry;
}

function withIcon(entry: NavEntry, key: string, icon: NavIcon): NavEntry {
  return entry.kind === 'pin' && entry.id === key ? { ...entry, icon } : entry;
}

export function setNodeIcon(items: NavItems, key: string, icon: NavIcon): NavItems {
  return items.map((node) => {
    if (node.kind === 'folder') {
      const own = node.id === key ? { icon } : {};
      return { ...node, ...own, items: node.items.map((entry) => withIcon(entry, key, icon)) };
    }
    return withIcon(node, key, icon);
  });
}

export function ungroupFolder(items: NavItems, folderId: string, keepPins: boolean): NavItems {
  return items.flatMap((node): readonly NavNode[] => {
    if (node.kind !== 'folder' || node.id !== folderId) return [node];
    return node.items.filter((entry) => keepPins || entry.kind === 'section');
  });
}

export function hideSection(
  layout: NavigationLayout,
  section: Exclude<NavSection, 'assistant'>,
): NavigationLayout {
  return layout.hidden.includes(section)
    ? layout
    : { ...layout, hidden: [...layout.hidden, section] };
}

export function showSection(layout: NavigationLayout, section: NavSection): NavigationLayout {
  return { ...layout, hidden: layout.hidden.filter((name) => name !== section) };
}
