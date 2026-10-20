import {
  NAV_TITLE_MAX,
  type NavIcon,
  type NavSection,
  type NavigationLayout,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { confirm } from '../components/confirm-store';
import { heavyThud } from '../platform/haptics';
import { localPref, setLocalPref } from '../store/local-prefs';
import type { EntityStore } from '../store/entity-store';
import { useEntityStore } from '../store/store-context';
import { FOLDER_ICON, navEditor } from './nav-edit-state';
import {
  activeLayoutOf,
  newNavId,
  useNavPins,
  useNavigationWriter,
  type NavPins,
  type NavigationWriter,
  type NavScope,
} from './nav-layout';
import {
  createFolder,
  foldTogether,
  hideSection,
  itemsOf,
  placeNode,
  type PlaceTarget,
  removeNode,
  renameNode,
  reorder,
  setNodeIcon,
  showSection,
  ungroupFolder,
  withItems,
  type NavItems,
} from './nav-edits';

const log = new Logger('app.nav');

const DEFAULT_FOLDER_TITLE = 'Folder';

export interface NavEdits extends NavPins {
  readonly move: (visible: readonly string[]) => void;
  readonly place: (key: string, target: PlaceTarget) => void;
  readonly foldInto: (dragged: string, target: string) => void;
  readonly newFolder: (title: string, icon: NavIcon, members: readonly string[]) => void;
  readonly rename: (key: string, title: string | null) => void;
  readonly setIcon: (key: string, icon: NavIcon) => void;
  readonly ungroup: (folderId: string, keepPins: boolean) => void;
  readonly remove: (key: string) => void;
  readonly hide: (section: Exclude<NavSection, 'assistant'>) => void;
  readonly show: (section: NavSection) => void;
  readonly reset: () => void;
  readonly switchScope: (scope: NavScope) => void;
}

function editItems(
  store: EntityStore,
  writer: NavigationWriter,
  message: string,
  change: (items: NavItems) => NavItems,
): void {
  const { layout } = activeLayoutOf(store.get());
  writer.commit(withItems(layout, change(itemsOf(layout))), message);
}

function editLayout(
  store: EntityStore,
  writer: NavigationWriter,
  message: string,
  change: (layout: NavigationLayout) => NavigationLayout,
): void {
  writer.commit(change(activeLayoutOf(store.get()).layout), message);
}

export function toggleNavFolder(folderId: string): void {
  const open = localPref('navFoldersOpen');
  setLocalPref(
    'navFoldersOpen',
    open.includes(folderId) ? open.filter((id) => id !== folderId) : [...open, folderId],
  );
}

export function confirmRemoveMissing(
  key: string,
  store: EntityStore,
  writer: NavigationWriter,
): void {
  confirm({
    title: 'Remove this pin?',
    body: 'It points at something that was removed.',
    confirmLabel: 'Remove',
    tone: 'destructive',
  })
    .then((accepted) => {
      if (accepted)
        editItems(store, writer, 'Removed from navigation', (items) => removeNode(items, key));
    })
    .catch((error: unknown) => {
      log.error('nav.remove_missing_failed', error);
    });
}

function folderTitle(title: string): string {
  return title.trim().slice(0, NAV_TITLE_MAX);
}

function foldIntoFolder(
  store: EntityStore,
  writer: NavigationWriter,
  dragged: string,
  target: string,
): void {
  const { layout } = activeLayoutOf(store.get());
  const current = itemsOf(layout);
  const id = newNavId();
  const folder = { id, title: DEFAULT_FOLDER_TITLE, icon: FOLDER_ICON };
  const next = foldTogether(current, folder, dragged, target);
  if (next === current) return;
  writer.commit(withItems(layout, next), 'Folder created');
  heavyThud();
  navEditor.set({ kind: 'rename', key: id });
}

export function useNavEdits(): NavEdits {
  const store = useEntityStore();
  const writer = useNavigationWriter();
  const pins = useNavPins();
  const items = (message: string, change: (current: NavItems) => NavItems): void => {
    editItems(store, writer, message, change);
  };
  return {
    ...pins,
    move: (visible): void => {
      items('Moved', (current) => reorder(current, visible));
    },
    place: (key, target): void => {
      items('Moved', (current) => placeNode(current, key, target));
    },
    foldInto: (dragged, target): void => {
      foldIntoFolder(store, writer, dragged, target);
    },
    newFolder: (title, icon, members): void => {
      const folder = { id: newNavId(), title: folderTitle(title), icon };
      items('Folder created', (current) => createFolder(current, folder, members));
    },
    rename: (key, title): void => {
      items('Renamed', (current) => renameNode(current, key, title));
    },
    setIcon: (key, icon): void => {
      items('Icon changed', (current) => setNodeIcon(current, key, icon));
    },
    ungroup: (folderId, keepPins): void => {
      items('Folder removed', (current) => ungroupFolder(current, folderId, keepPins));
    },
    remove: (key): void => {
      items('Removed from navigation', (current) => removeNode(current, key));
    },
    hide: (section): void => {
      editLayout(store, writer, 'Hidden from navigation', (layout) => hideSection(layout, section));
    },
    show: (section): void => {
      editLayout(store, writer, 'Shown in navigation', (layout) => showSection(layout, section));
    },
    reset: writer.reset,
    switchScope: writer.switchScope,
  };
}
