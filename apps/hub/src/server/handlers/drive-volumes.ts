import type { z } from 'zod';
import type { DRIVE_VOLUME_ENTRY, DriveRoot } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { parseMountInfo, type MountEntry, type VolumeProbe } from '../../drive/volumes';

const log = new Logger('hub.drive');

export type DriveVolumeEntry = z.infer<typeof DRIVE_VOLUME_ENTRY>;

const NETWORK_FILESYSTEMS: ReadonlySet<string> = new Set([
  'nfs',
  'nfs4',
  'cifs',
  'smb3',
  'smbfs',
  '9p',
  'ceph',
  'glusterfs',
  'afs',
  'fuse.sshfs',
  'fuse.rclone',
]);

function isDisk(entry: MountEntry): boolean {
  return (
    NETWORK_FILESYSTEMS.has(entry.fsType) || (entry.source.startsWith('/') && entry.root === '/')
  );
}

function shallowestPerDevice(entries: readonly MountEntry[]): MountEntry[] {
  const byDevice = new Map<string, MountEntry>();
  for (const entry of entries) {
    const known = byDevice.get(entry.device);
    if (known === undefined || entry.mountPoint.length < known.mountPoint.length) {
      byDevice.set(entry.device, entry);
    }
  }
  return [...byDevice.values()];
}

function rootsOn(roots: readonly DriveRoot[], mount: MountEntry): string[] {
  return roots
    .filter(
      (root) =>
        'volume' in root && root.volume !== null && root.volume.mountId === String(mount.mountId),
    )
    .map((root) => root.id);
}

async function entryOf(
  probe: VolumeProbe,
  roots: readonly DriveRoot[],
  mount: MountEntry,
): Promise<DriveVolumeEntry> {
  const space = await probe.space(mount.mountPoint);
  return {
    mountId: String(mount.mountId),
    fsType: mount.fsType,
    network: NETWORK_FILESYSTEMS.has(mount.fsType),
    mountPoint: mount.mountPoint,
    totalBytes: space.totalBytes,
    freeBytes: space.freeBytes,
    rootIds: rootsOn(roots, mount),
  };
}

export async function listVolumes(
  probe: VolumeProbe,
  roots: readonly DriveRoot[],
): Promise<DriveVolumeEntry[]> {
  const mounts = shallowestPerDevice(parseMountInfo(await probe.readMountInfo()).filter(isDisk));
  const settled = await Promise.allSettled(mounts.map((mount) => entryOf(probe, roots, mount)));
  return settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [result.value];
    log.warn('drive_volumes.unreadable', {
      mountPoint: mounts[index]?.mountPoint ?? '',
      reason: messageOf(result.reason),
    });
    return [];
  });
}
