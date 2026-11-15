import type { FileNodeKind, SortField } from './types';

export const FLAG_ABILITIES = [
  'list',
  'grid',
  'thumbnails',
  'kindFilter',
  'hidden',
  'pathEntry',
  'places',
  'live',
  'searchNames',
  'searchContents',
  'newFolder',
  'upload',
  'uploadResume',
  'rename',
  'move',
  'copy',
  'dragMove',
  'trash',
  'restore',
  'deleteNow',
  'trashView',
  'download',
  'downloadZip',
  'attach',
  'zipContents',
  'details',
  'star',
  'share',
  'comments',
  'versions',
  'activity',
  'shortcuts',
  'colour',
  'offline',
  'lock',
  'priority',
] as const;

export type FlagAbility = (typeof FLAG_ABILITIES)[number];

export type FileAbilities = Readonly<Record<FlagAbility, boolean>> & {
  readonly sort: readonly SortField[];
  readonly quickLook: readonly FileNodeKind[];
};

const NONE = {
  list: false,
  grid: false,
  thumbnails: false,
  kindFilter: false,
  hidden: false,
  pathEntry: false,
  places: false,
  live: false,
  searchNames: false,
  searchContents: false,
  newFolder: false,
  upload: false,
  uploadResume: false,
  rename: false,
  move: false,
  copy: false,
  dragMove: false,
  trash: false,
  restore: false,
  deleteNow: false,
  trashView: false,
  download: false,
  downloadZip: false,
  attach: false,
  zipContents: false,
  details: false,
  star: false,
  share: false,
  comments: false,
  versions: false,
  activity: false,
  shortcuts: false,
  colour: false,
  offline: false,
  lock: false,
  priority: false,
} as const satisfies Readonly<Record<FlagAbility, false>>;

export const NO_ABILITIES: FileAbilities = { ...NONE, sort: [], quickLook: [] };

export function abilitiesOf(
  granted: readonly FlagAbility[],
  extra: Partial<Pick<FileAbilities, 'sort' | 'quickLook'>> = {},
): FileAbilities {
  const flags: Record<FlagAbility, boolean> = { ...NONE };
  for (const flag of granted) flags[flag] = true;
  return { ...flags, sort: extra.sort ?? [], quickLook: extra.quickLook ?? [] };
}

export function grantedOf(abilities: FileAbilities): readonly FlagAbility[] {
  return FLAG_ABILITIES.filter((flag) => abilities[flag]);
}

const NEEDS: readonly (readonly [FlagAbility, FlagAbility])[] = [
  ['uploadResume', 'upload'],
  ['dragMove', 'move'],
  ['searchContents', 'searchNames'],
  ['deleteNow', 'trashView'],
  ['restore', 'trashView'],
  ['trashView', 'trash'],
  ['downloadZip', 'download'],
];

export interface AbilityProblem {
  readonly ability: FlagAbility | 'sort' | 'quickLook';
  readonly needs: FlagAbility | 'name' | 'files';
}

export function abilityProblemsOf(abilities: FileAbilities): readonly AbilityProblem[] {
  const problems: AbilityProblem[] = NEEDS.filter(
    ([ability, needs]) => abilities[ability] && !abilities[needs],
  ).map(([ability, needs]) => ({ ability, needs }));
  if (abilities.sort.length > 0 && !abilities.sort.includes('name')) {
    problems.push({ ability: 'sort', needs: 'name' });
  }
  if (abilities.quickLook.includes('folder')) {
    problems.push({ ability: 'quickLook', needs: 'files' });
  }
  return problems;
}

export function readOnlyOf(abilities: FileAbilities): FileAbilities {
  return {
    ...abilities,
    newFolder: false,
    upload: false,
    uploadResume: false,
    rename: false,
    move: false,
    copy: false,
    dragMove: false,
    trash: false,
    restore: false,
    deleteNow: false,
    trashView: false,
    star: false,
    share: false,
    shortcuts: false,
    colour: false,
    lock: false,
  };
}

export function offlineOf(abilities: FileAbilities): FileAbilities {
  return {
    ...readOnlyOf(abilities),
    searchNames: false,
    searchContents: false,
    download: false,
    downloadZip: false,
    attach: false,
    zipContents: false,
    thumbnails: false,
    live: false,
    quickLook: [],
  };
}
