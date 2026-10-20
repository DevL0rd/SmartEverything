import { shiftTarget } from './nav-drag';
import type { MenuItem } from '../components/menu-rows';
import type { PlaceTarget } from './nav-edits';
import type { NavEdits } from './nav-edit-actions';
import type { NavEditor } from './nav-edit-state';
import type { NavEntry } from './nav-model';
import { removalMenuItem, removalOf } from './nav-removal';
import type { NavRow } from './nav-rows';

export interface FolderChoice {
  readonly key: string;
  readonly title: string;
}

export interface NavMenuInput {
  readonly row: NavRow;
  readonly rows: readonly NavRow[];
  readonly folders: readonly FolderChoice[];
  readonly edits: NavEdits;
  readonly openEditor: (editor: NavEditor) => void;
}

function shiftItem(
  { row, edits }: NavMenuInput,
  label: string,
  icon: 'chevronUp' | 'chevronDown',
  target: PlaceTarget | null,
): readonly MenuItem[] {
  if (target === null) return [];
  return [
    {
      label,
      icon,
      onPress: (): void => {
        edits.place(row.key, target);
      },
    },
  ];
}

function ordering(input: NavMenuInput): readonly MenuItem[] {
  const { row, rows } = input;
  return [
    ...shiftItem(input, 'Move up', 'chevronUp', shiftTarget(rows, row.key, -1)),
    ...shiftItem(input, 'Move down', 'chevronDown', shiftTarget(rows, row.key, 1)),
  ];
}

function placement({ row, folders, edits, openEditor }: NavMenuInput): readonly MenuItem[] {
  const destinations = folders
    .filter((folder) => folder.key !== row.parent)
    .map((folder): MenuItem => ({
      label: `Move to ${folder.title}`,
      icon: 'folder',
      onPress: (): void => {
        edits.place(row.key, { parent: folder.key, before: null });
      },
    }));
  const create: MenuItem = {
    label: 'Move to a new folder',
    icon: 'plus',
    onPress: (): void => {
      openEditor({ kind: 'folder', members: [row.key] });
    },
  };
  const leave: MenuItem = {
    label: 'Move out of folder',
    icon: 'arrowLeft',
    onPress: (): void => {
      edits.place(row.key, { parent: null, before: null });
    },
  };
  return [...destinations, create, ...(row.parent === null ? [] : [leave])];
}

function appearance({ row, openEditor }: NavMenuInput): readonly MenuItem[] {
  return [
    {
      label: 'Rename',
      icon: 'pencil',
      onPress: (): void => {
        openEditor({ kind: 'rename', key: row.key });
      },
    },
    {
      label: 'Change icon',
      icon: 'palette',
      onPress: (): void => {
        openEditor({ kind: 'icon', key: row.key });
      },
    },
  ];
}

function folderItems(input: NavMenuInput, key: string): readonly MenuItem[] {
  return [
    ...appearance(input),
    ...ordering(input),
    {
      label: 'Ungroup',
      icon: 'arrowUp',
      onPress: (): void => {
        input.edits.ungroup(key, true);
      },
    },
    {
      label: 'Delete folder and its pins',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        input.edits.ungroup(key, false);
      },
    },
  ];
}

function removalItems({ edits }: NavMenuInput, entry: NavEntry): readonly MenuItem[] {
  const removal = removalOf(entry);
  return removal === null ? [] : [removalMenuItem(removal, entry.key, edits)];
}

function entryItems(input: NavMenuInput, entry: NavEntry): readonly MenuItem[] {
  return [
    ...(entry.kind === 'pin' ? appearance(input) : []),
    ...ordering(input),
    ...placement(input),
    ...removalItems(input, entry),
  ];
}

export function navMenuItems(input: NavMenuInput): readonly MenuItem[] {
  const { row } = input;
  return row.kind === 'folder' ? folderItems(input, row.key) : entryItems(input, row.entry);
}
