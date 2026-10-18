import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drivesOf, FilePlacesReader } from '../../src/node/controls/linux/file-places';

const MOUNTS = [
  '/dev/nvme0n1p2 / btrfs rw 0 0',
  '/dev/nvme0n1p2 /home btrfs rw,subvol=/@home 0 0',
  '/dev/nvme0n1p1 /boot/efi vfat rw 0 0',
  '/dev/sda1 /run/media/dana/Backup\\040Disk ext4 rw 0 0',
  '/dev/sdb1 /mnt/games ntfs3 rw 0 0',
  '/dev/sdc1 /mnt/stick exfat rw 0 0',
  '//nas/share /mnt/nas cifs rw 0 0',
  'proc /proc proc rw 0 0',
  'tmpfs /tmp tmpfs rw 0 0',
  '/dev/sdd1 /var/lib/docker ext4 rw 0 0',
  'tmpfs /run/user/1000 tmpfs rw 0 0',
].join('\n');

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'se-places-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('drives', () => {
  it('lists the real drives and shares a person would browse, not the system mounts', () => {
    expect(drivesOf(MOUNTS)).toEqual([
      { label: 'Backup Disk', path: '/run/media/dana/Backup Disk', kind: 'drive' },
      { label: 'games', path: '/mnt/games', kind: 'drive' },
      { label: 'stick', path: '/mnt/stick', kind: 'drive' },
      { label: 'nas', path: '/mnt/nas', kind: 'drive' },
    ]);
  });
});

describe('places', () => {
  async function reader(userDirs: string | null, mounts = MOUNTS): Promise<FilePlacesReader> {
    const home = join(folder, 'home');
    await mkdir(join(home, 'Downloads'), { recursive: true });
    await mkdir(join(home, 'Documents'), { recursive: true });
    await mkdir(join(home, 'Music'), { recursive: true });
    await mkdir(join(folder, 'elsewhere'));
    await writeFile(join(folder, 'mounts'), mounts);
    if (userDirs !== null) await writeFile(join(folder, 'user-dirs.dirs'), userDirs);
    return new FilePlacesReader(home, {
      mounts: join(folder, 'mounts'),
      userDirs: join(folder, 'user-dirs.dirs'),
    });
  }

  it('starts at home, then the usual folders that exist, the computer and the drives', async () => {
    const places = await (await reader(null)).read();
    expect(places.home).toBe(join(folder, 'home'));
    expect(places.places.map((place) => [place.label, place.kind])).toEqual([
      ['Home', 'home'],
      ['Downloads', 'folder'],
      ['Documents', 'folder'],
      ['Computer', 'root'],
      ['Backup Disk', 'drive'],
      ['games', 'drive'],
      ['stick', 'drive'],
      ['nas', 'drive'],
    ]);
  });

  it('follows the folders the desktop moved elsewhere', async () => {
    const places = await (
      await reader(
        `XDG_DOWNLOAD_DIR="${join(folder, 'elsewhere')}"\nXDG_DESKTOP_DIR="$HOME/Desk"\n`,
      )
    ).read();
    expect(places.places.find((place) => place.label === 'Downloads')?.path).toBe(
      join(folder, 'elsewhere'),
    );
    expect(places.places.some((place) => place.label === 'Desktop')).toBe(false);
  });

  it('still answers when the mount list cannot be read', async () => {
    const home = join(folder, 'home');
    await mkdir(home);
    const places = await new FilePlacesReader(home, {
      mounts: join(folder, 'missing'),
      userDirs: join(folder, 'missing'),
    }).read();
    expect(places.places.map((place) => place.label)).toEqual(['Home', 'Computer']);
  });
});
