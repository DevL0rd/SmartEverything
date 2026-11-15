import {
  abilitiesOf,
  offlineOf,
  readOnlyOf,
  type FileAbilities,
  type FlagAbility,
  type SortField,
} from '../../files';
import { canShareLink, canWrite, type DriveAccess } from '../model/drive-access';
import { DRIVE_PLACES, type DrivePlaceKey } from './drive-places';

export const DRIVE_SORT_FIELD_LIST: readonly SortField[] = ['name', 'size', 'modifiedAt'];

const BROWSE: readonly FlagAbility[] = [
  'list',
  'grid',
  'thumbnails',
  'kindFilter',
  'hidden',
  'places',
  'live',
  'details',
  'download',
  'downloadZip',
  'zipContents',
  'star',
  'comments',
  'versions',
  'activity',
  'shortcuts',
  'colour',
];

const FIND: readonly FlagAbility[] = ['searchNames', 'searchContents'];

const CHANGE: readonly FlagAbility[] = [
  'newFolder',
  'upload',
  'uploadResume',
  'rename',
  'move',
  'copy',
  'dragMove',
  'trash',
];

const TRASH_VIEW: readonly FlagAbility[] = [
  'list',
  'grid',
  'kindFilter',
  'hidden',
  'places',
  'live',
  'details',
  'trash',
  'trashView',
  'restore',
  'deleteNow',
];

const QUICK_LOOK = ['image', 'video', 'audio', 'document', 'archive'] as const;

export interface DriveAbilityInput {
  readonly place: DrivePlaceKey;
  readonly atTop: boolean;
  readonly access: DriveAccess;
  readonly online: boolean;
  readonly phone: boolean;
}

function extrasOf(input: DriveAbilityInput): readonly FlagAbility[] {
  const { access, phone, place } = input;
  return [
    ...(canShareLink(access) ? (['share', 'lock'] as const) : []),
    ...(phone ? (['offline'] as const) : []),
    ...(place === DRIVE_PLACES.sharedWithMe ? [] : (['priority'] as const)),
  ];
}

function folderAbilities(input: DriveAbilityInput): FileAbilities {
  const full = abilitiesOf([...BROWSE, ...FIND, ...CHANGE, ...extrasOf(input)], {
    sort: DRIVE_SORT_FIELD_LIST,
    quickLook: QUICK_LOOK,
  });
  if (canWrite(input.access)) return full;
  const viewer = readOnlyOf(full);
  return { ...viewer, star: full.star, copy: full.copy };
}

function sharedTopAbilities(input: DriveAbilityInput): FileAbilities {
  const base = abilitiesOf([...BROWSE, ...extrasOf(input)], {
    sort: DRIVE_SORT_FIELD_LIST,
    quickLook: QUICK_LOOK,
  });
  return { ...readOnlyOf(base), star: true, copy: true };
}

export function driveAbilitiesOf(input: DriveAbilityInput): FileAbilities {
  const base = baseAbilitiesOf(input);
  if (input.online) return base;
  return {
    ...offlineOf(base),
    share: false,
    lock: false,
    comments: false,
    versions: false,
    activity: false,
    shortcuts: false,
    colour: false,
    offline: false,
    priority: false,
  };
}

function baseAbilitiesOf(input: DriveAbilityInput): FileAbilities {
  if (input.place === DRIVE_PLACES.trash) {
    return abilitiesOf(TRASH_VIEW, { sort: DRIVE_SORT_FIELD_LIST });
  }
  if (input.place === DRIVE_PLACES.sharedWithMe && input.atTop) return sharedTopAbilities(input);
  return folderAbilities(input);
}
