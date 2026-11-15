import type { DriveZipEntry } from '@smarteverything/domain';
import {
  NO_ABILITIES,
  abilitiesOf,
  offlineOf,
  readOnlyOf,
  type FileAbilities,
  type FlagAbility,
} from './abilities';
import type { FixtureSeed } from './fixture-source';
import type { FixtureEntry } from './fixture-tree';
import type { FileLocation, FilePlace } from './types';

export const COMPUTER_FIXTURES = ['linux', 'windows', 'offline', 'no_scope'] as const;

export type ComputerFixture = (typeof COMPUTER_FIXTURES)[number];

const COMPUTER_FLAGS: readonly FlagAbility[] = [
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
];

export const COMPUTER_FULL: FileAbilities = abilitiesOf(COMPUTER_FLAGS, {
  sort: ['name', 'size', 'modifiedAt'],
  quickLook: ['image', 'video', 'audio', 'document', 'archive'],
});

const HOME = '/home/dana';

const TRASH = 'trash';

const at = (hours: number): string =>
  new Date(Date.parse('2026-11-14T10:00:00.000Z') - hours * 3_600_000).toISOString();

const MB = 1_000_000;

const ZIP: readonly DriveZipEntry[] = [
  {
    index: 0,
    path: 'site/',
    name: 'site',
    folder: true,
    bytes: 0,
    compressedBytes: 0,
    modifiedAt: at(400),
    encrypted: false,
    kind: 'folder',
  },
  {
    index: 1,
    path: 'site/index.html',
    name: 'index.html',
    folder: false,
    bytes: 18_400,
    compressedBytes: 5_100,
    modifiedAt: at(400),
    encrypted: false,
    kind: 'document',
  },
  {
    index: 2,
    path: 'site/logo.png',
    name: 'logo.png',
    folder: false,
    bytes: 240_000,
    compressedBytes: 236_000,
    modifiedAt: at(410),
    encrypted: false,
    kind: 'image',
  },
  {
    index: 3,
    path: 'secrets.txt',
    name: 'secrets.txt',
    folder: false,
    bytes: 900,
    compressedBytes: 600,
    modifiedAt: at(420),
    encrypted: true,
    kind: 'document',
  },
];

const entry = (
  path: string,
  change: Omit<FixtureEntry, 'key' | 'parentKey' | 'name'> = {},
): FixtureEntry => {
  const cut = path.lastIndexOf('/');
  return { key: path, parentKey: path.slice(0, cut) || '/', name: path.slice(cut + 1), ...change };
};

const folder = (path: string, hours: number): FixtureEntry =>
  entry(path, { kind: 'folder', modifiedAt: at(hours) });

export const COMPUTER_ENTRIES: readonly FixtureEntry[] = [
  folder('/home', 900),
  folder(HOME, 2),
  folder(`${HOME}/Documents`, 3),
  folder(`${HOME}/Projects`, 20),
  folder(`${HOME}/Pictures`, 60),
  folder(`${HOME}/.config`, 200),
  folder(`${HOME}/Projects/site`, 30),
  entry(`${HOME}/notes.txt`, {
    mime: 'text/plain',
    size: 4_200,
    modifiedAt: at(1),
    text: 'Pay the plumber invoice on Friday and call the bank.',
  }),
  entry(`${HOME}/report.pdf`, { mime: 'application/pdf', size: 2.4 * MB, modifiedAt: at(5) }),
  entry(`${HOME}/holiday.jpg`, { mime: 'image/jpeg', size: 3.1 * MB, modifiedAt: at(50) }),
  entry(`${HOME}/walkthrough.mp4`, { mime: 'video/mp4', size: 412 * MB, modifiedAt: at(90) }),
  entry(`${HOME}/backup.zip`, {
    mime: 'application/zip',
    size: 18 * MB,
    modifiedAt: at(120),
    zip: ZIP,
  }),
  entry(`${HOME}/.bashrc`, { mime: 'text/plain', size: 3_800, modifiedAt: at(900) }),
  entry(`${HOME}/Projects/readme.md`, {
    mime: 'text/markdown',
    size: 1_200,
    modifiedAt: at(25),
    text: 'The invoice tool reads every receipt in this folder.',
  }),
  entry(`${HOME}/Projects/site/index.html`, {
    mime: 'text/html',
    size: 18_400,
    modifiedAt: at(31),
  }),
  entry(`${HOME}/Documents/tax-2025.pdf`, {
    mime: 'application/pdf',
    size: 820_000,
    modifiedAt: at(300),
  }),
  entry(`${HOME}/Pictures/garden.png`, { mime: 'image/png', size: 5.6 * MB, modifiedAt: at(70) }),
];

export const COMPUTER_TRASHED: readonly FixtureEntry[] = [
  entry(`${HOME}/old-draft.txt`, { mime: 'text/plain', size: 2_100, modifiedAt: at(10) }),
  entry(`${HOME}/Screenshot 2026-11-01.png`, {
    mime: 'image/png',
    size: 1.2 * MB,
    modifiedAt: at(300),
  }),
];

const place = (key: string, label: string, kind: FilePlace['kind']): FilePlace => ({
  key,
  label,
  kind,
  location: { place: key, folder: null },
});

const LINUX_PLACES: readonly FilePlace[] = [
  place(HOME, 'Home', 'home'),
  place(`${HOME}/Documents`, 'Documents', 'folder'),
  place(`${HOME}/Pictures`, 'Pictures', 'folder'),
  place('/', 'Computer', 'root'),
  place(TRASH, 'Trash', 'trash'),
];

const ABILITIES: Readonly<Record<ComputerFixture, FileAbilities>> = {
  linux: COMPUTER_FULL,
  windows: { ...readOnlyOf(COMPUTER_FULL), searchContents: false, pathEntry: true },
  offline: offlineOf(COMPUTER_FULL),
  no_scope: NO_ABILITIES,
};

function placesOf(fixture: ComputerFixture): readonly FilePlace[] {
  if (fixture === 'no_scope') return [];
  return fixture === 'linux' ? LINUX_PLACES : LINUX_PLACES.filter((item) => item.kind !== 'trash');
}

export function computerSeedOf(fixture: ComputerFixture): FixtureSeed {
  const abilities = ABILITIES[fixture];
  const writable = fixture === 'linux';
  const entries =
    fixture === 'no_scope' ? [] : COMPUTER_ENTRIES.map((item) => ({ ...item, writable }));
  return {
    id: `computer-${fixture}`,
    label: fixture === 'windows' ? 'Office PC' : 'Workstation',
    places: placesOf(fixture),
    entries,
    trashed: fixture === 'linux' ? COMPUTER_TRASHED : [],
    abilities: (location: FileLocation) =>
      location.place === TRASH ? { ...abilities, upload: false, newFolder: false } : abilities,
  };
}

export const COMPUTER_HOME: FileLocation = { place: HOME, folder: null };

export const COMPUTER_TRASH: FileLocation = { place: TRASH, folder: null };
