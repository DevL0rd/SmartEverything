import { AI_HARNESS_WORKSPACE_CHOICE, FILE_PATH, type FileEntry } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { shortDate } from '../../../format/time';
import { naturalCompare } from '../../../format/text';

export type PickerMode = 'folder' | 'file';

export interface Crumb {
  readonly label: string;
  readonly path: string;
}

const COMPUTER_CRUMB: Crumb = { label: 'Computer', path: '/' };

export function breadcrumbs(path: string, home: string | null): readonly Crumb[] {
  const underHome = home !== null && home !== '/' && (path === home || path.startsWith(`${home}/`));
  const base = underHome ? home : '/';
  const rest = path
    .slice(base.length)
    .split('/')
    .filter((part) => part !== '');
  const first: readonly Crumb[] = underHome
    ? [COMPUTER_CRUMB, { label: 'Home', path: home }]
    : [COMPUTER_CRUMB];
  return rest.reduce<readonly Crumb[]>((crumbs, part) => {
    const parent = crumbs.at(-1)?.path ?? '/';
    return [...crumbs, { label: part, path: `${parent === '/' ? '' : parent}/${part}` }];
  }, first);
}

function byName(left: FileEntry, right: FileEntry): number {
  return naturalCompare(left.name, right.name);
}

export function orderEntries(
  entries: readonly FileEntry[],
  showHidden: boolean,
): readonly FileEntry[] {
  const shown = showHidden ? entries : entries.filter((entry) => !entry.hidden);
  const folders = shown.filter((entry) => entry.kind === 'folder').sort(byName);
  const rest = shown.filter((entry) => entry.kind !== 'folder').sort(byName);
  return [...folders, ...rest];
}

export function isUsablePath(path: string): boolean {
  return FILE_PATH.safeParse(path).success;
}

export function newFolderError(parent: string, name: string): string | null {
  if (name.trim() === '') return null;
  const parsed = AI_HARNESS_WORKSPACE_CHOICE.safeParse({ action: 'create', parent, name });
  return parsed.success ? null : 'Use a name without slashes, up to 200 characters.';
}

export function entryLine(entry: FileEntry): string {
  const modified = `modified ${shortDate(entry.modifiedAt)}`;
  if (entry.kind === 'folder') return `Folder · ${modified}`;
  if (entry.kind === 'other') return `Special file · ${modified}`;
  const kind = entry.kind === 'link' ? 'Link · ' : '';
  return `${kind}${bytes(entry.size)} · ${modified}`;
}

export function entryEnabled(mode: PickerMode, entry: FileEntry): boolean {
  if (entry.kind === 'folder') return true;
  if (entry.kind === 'other') return false;
  return mode !== 'folder';
}
