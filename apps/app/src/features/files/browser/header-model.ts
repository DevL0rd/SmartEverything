import { joinParts } from '../../../format/text';
import type { FileAbilities } from '../source/abilities';
import { itemsLine } from '../source/node';
import type { FileCrumb, FileNode, FilePlace } from '../source/types';
import { areaActionsOf, type AreaAction, type AreaActions } from './menu-specs';

export interface HeaderModelInput {
  readonly sourceLabel: string;
  readonly place: FilePlace | null;
  readonly folder: FileNode | null;
  readonly crumbs: readonly FileCrumb[];
  readonly total: number | null;
  readonly abilities: FileAbilities;
  readonly offline: boolean;
}

export interface HeaderModel {
  readonly title: string;
  readonly subtitle: string | null;
  readonly area: AreaActions;
}

export const AREA_LABEL: Readonly<Record<AreaAction, string>> = {
  upload: 'Upload',
  newFolder: 'New folder',
};

export function inTrashOf(place: FilePlace | null): boolean {
  return place?.kind === 'trash';
}

const CHANGE_ABILITIES = [
  'newFolder',
  'upload',
  'rename',
  'move',
  'trash',
  'restore',
  'deleteNow',
] as const;

export function readOnlyPlace(abilities: FileAbilities, folder: FileNode | null): boolean {
  if (folder !== null && !folder.writable) return true;
  return abilities.list && CHANGE_ABILITIES.every((ability) => !abilities[ability]);
}

export function titleOf(
  input: Pick<HeaderModelInput, 'sourceLabel' | 'place' | 'folder' | 'crumbs'>,
): string {
  return (
    input.folder?.name ?? input.crumbs.at(-1)?.label ?? input.place?.label ?? input.sourceLabel
  );
}

function subtitleOf(input: HeaderModelInput): string | null {
  const { folder, abilities, offline, total } = input;
  const line = joinParts([
    total === null ? null : itemsLine(total),
    folder?.marks.locked === true ? 'View only' : null,
    !inTrashOf(input.place) && readOnlyPlace(abilities, folder) ? 'Read only' : null,
    offline ? 'Offline' : null,
  ]);
  return line === '' ? null : line;
}

function writableArea(abilities: FileAbilities, folder: FileNode | null): FileAbilities {
  if (folder === null || folder.writable) return abilities;
  return { ...abilities, upload: false, newFolder: false };
}

export function headerModelOf(input: HeaderModelInput): HeaderModel {
  const inTrash = inTrashOf(input.place);
  return {
    title: titleOf(input),
    subtitle: subtitleOf(input),
    area: input.offline
      ? { primary: null, secondary: [] }
      : areaActionsOf(writableArea(input.abilities, input.folder), inTrash),
  };
}
