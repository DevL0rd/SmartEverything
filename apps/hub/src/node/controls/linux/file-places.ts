import type { FilePlaces } from '@smarteverything/domain';
import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { orElse } from './fs-fallback';

type Place = FilePlaces['places'][number];

const DRIVE_TYPES: ReadonlySet<string> = new Set([
  'ext2',
  'ext3',
  'ext4',
  'btrfs',
  'xfs',
  'f2fs',
  'vfat',
  'exfat',
  'ntfs',
  'ntfs3',
  'fuseblk',
  'zfs',
  'bcachefs',
  'cifs',
  'nfs',
  'nfs4',
]);
const NETWORK_TYPES: ReadonlySet<string> = new Set(['cifs', 'nfs', 'nfs4']);
const SYSTEM_PREFIXES: readonly string[] = [
  '/boot',
  '/efi',
  '/var',
  '/usr',
  '/opt',
  '/snap',
  '/srv',
  '/tmp',
  '/proc',
  '/sys',
  '/dev',
];
const USER_FOLDERS: readonly (readonly [string, string, string])[] = [
  ['Downloads', 'XDG_DOWNLOAD_DIR', 'Downloads'],
  ['Desktop', 'XDG_DESKTOP_DIR', 'Desktop'],
  ['Documents', 'XDG_DOCUMENTS_DIR', 'Documents'],
];

interface PlacesSources {
  readonly mounts: string;
  readonly userDirs: string;
}

function unescaped(field: string): string {
  return field.replace(/\\(\d{3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

function isSystemMount(mount: string): boolean {
  return (
    mount === '/' ||
    SYSTEM_PREFIXES.some((prefix) => mount === prefix || mount.startsWith(`${prefix}/`))
  );
}

function driveOf(line: string): { readonly device: string; readonly place: Place } | null {
  const [device = '', mount = '', type = ''] = line.split(' ');
  const network = NETWORK_TYPES.has(type);
  if (!DRIVE_TYPES.has(type) || !(network || device.startsWith('/dev/'))) {
    return null;
  }
  const path = unescaped(mount);
  return { device, place: { label: basename(path), path, kind: 'drive' } };
}

export function drivesOf(mounts: string): Place[] {
  const seen = new Set<string>();
  return mounts.split('\n').flatMap((line): Place[] => {
    const drive = driveOf(line);
    if (drive === null || seen.has(drive.device)) {
      return [];
    }
    seen.add(drive.device);
    return isSystemMount(drive.place.path) ? [] : [drive.place];
  });
}

function userDirOf(text: string, key: string, home: string): string | null {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`${key}=`));
  const value = line?.slice(key.length + 1).replace(/^"|"$/g, '');
  return value === undefined || value === '' ? null : value.replace('$HOME', home);
}

async function isFolder(path: string): Promise<boolean> {
  const info = await orElse(stat(path), null, ['ENOENT', 'ENOTDIR', 'EACCES']);
  return info?.isDirectory() === true;
}

async function usualFolders(home: string, userDirs: string): Promise<Place[]> {
  const text = await orElse(readFile(userDirs, 'utf8'), '');
  const candidates = USER_FOLDERS.map(([label, key, fallback]): Place => ({
    label,
    path: userDirOf(text, key, home) ?? join(home, fallback),
    kind: 'folder',
  }));
  const found = await Promise.all(
    candidates.map(async (place) =>
      place.path !== home && (await isFolder(place.path)) ? place : null,
    ),
  );
  return found.filter((place) => place !== null);
}

export class FilePlacesReader {
  constructor(
    private readonly home: string,
    private readonly sources: PlacesSources,
  ) {}

  async read(): Promise<FilePlaces> {
    const folders = await usualFolders(this.home, this.sources.userDirs);
    const mounts = await orElse(readFile(this.sources.mounts, 'utf8'), '');
    return {
      home: this.home,
      places: [
        { label: 'Home', path: this.home, kind: 'home' },
        ...folders,
        { label: 'Computer', path: '/', kind: 'root' },
        ...drivesOf(mounts),
      ],
    };
  }
}
