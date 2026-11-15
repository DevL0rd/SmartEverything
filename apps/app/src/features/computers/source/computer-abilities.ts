import type { FileAbility } from '@smarteverything/domain';
import {
  NO_ABILITIES,
  abilitiesOf,
  grantedOf,
  offlineOf,
  type FileAbilities,
  type FlagAbility,
} from '../../files';

export const COMPUTER_TRASH_PLACE = 'trash';

const BROWSING: readonly FlagAbility[] = [
  'list',
  'grid',
  'thumbnails',
  'kindFilter',
  'hidden',
  'pathEntry',
  'places',
  'details',
];

const GRANTED: Readonly<Record<FileAbility, readonly FlagAbility[]>> = {
  write: ['newFolder', 'rename', 'move', 'copy', 'dragMove'],
  upload: ['upload'],
  search: ['searchNames'],
  contents: ['searchContents'],
  properties: [],
  download: ['download', 'downloadZip', 'attach'],
  zip: ['zipContents'],
  trash: ['trash', 'restore', 'deleteNow', 'trashView'],
  watch: ['live'],
};

const IN_TRASH_OFF: readonly FlagAbility[] = [
  'newFolder',
  'upload',
  'uploadResume',
  'rename',
  'move',
  'copy',
  'dragMove',
  'download',
  'downloadZip',
  'attach',
  'searchNames',
  'searchContents',
  'thumbnails',
  'zipContents',
  'pathEntry',
  'live',
];

export interface ComputerReachState {
  readonly scope: boolean | null;
  readonly online: boolean;
  readonly granted: readonly FileAbility[];
}

export function computerAbilitiesOf(granted: readonly FileAbility[]): FileAbilities {
  const flags = new Set<FlagAbility>(BROWSING);
  for (const ability of granted) for (const flag of GRANTED[ability]) flags.add(flag);
  if (!granted.includes('search')) flags.delete('searchContents');
  return abilitiesOf([...flags], {
    sort: ['name', 'size', 'modifiedAt'],
    quickLook: ['image', 'video', 'audio', 'document', 'archive'],
  });
}

export function inTrashOf(abilities: FileAbilities): FileAbilities {
  const off = new Set<FlagAbility>(IN_TRASH_OFF);
  return abilitiesOf(
    grantedOf(abilities).filter((flag) => !off.has(flag)),
    { sort: abilities.sort, quickLook: [] },
  );
}

export function reachedAbilitiesOf(reach: ComputerReachState): FileAbilities {
  if (reach.scope === false) return NO_ABILITIES;
  const base = computerAbilitiesOf(reach.granted);
  return reach.online ? base : offlineOf(base);
}

export function abilitiesAtOf(abilities: FileAbilities, trash: boolean): FileAbilities {
  return trash ? inTrashOf(abilities) : abilities;
}
