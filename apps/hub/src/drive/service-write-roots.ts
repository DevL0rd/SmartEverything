import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ApiError,
  DRIVE_ROOT,
  type DriveRoot,
  type DriveRootAdd,
  type DriveRootChange,
  type DriveVolume,
} from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { UNSYNCED, type DriveRootPatch } from '../store/repositories/drive-roots';
import { checkRootPlacement } from './paths';
import {
  MARKER_FILE,
  RootMarkerError,
  readRootMarker,
  removeLinkedRecord,
  writeLinkedRecord,
  writeRootMarker,
} from './root-marker';
import { requireOwner, type DriveCaller, type WriteStore } from './service-write-support';
import { findMount, parseMountInfo, type VolumeProbe } from './volumes';

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

export interface RootAdminDeps {
  readonly store: WriteStore;
  readonly probe: VolumeProbe;
  readonly layout: HubLayout;
  readonly installDirectory: string;
  readonly newId: () => string;
  readonly scan: (rootId: string) => void;
  readonly rearmPurge: () => void;
}

type PhysicalRoot = Extract<DriveRoot, { readonly path: string }>;

type MutablePatch = { -readonly [K in keyof DriveRootPatch]: DriveRootPatch[K] };

async function volumeRecord(real: string, probe: VolumeProbe): Promise<DriveVolume> {
  const mount = findMount(parseMountInfo(await probe.readMountInfo()), real);
  return {
    mountId: String(mount.mountId),
    fsType: mount.fsType,
    network: NETWORK_FILESYSTEMS.has(mount.fsType),
  };
}

function physicalOf(root: DriveRoot | undefined): PhysicalRoot {
  if (root === undefined) {
    throw new ApiError('not_found', 'There is no such library folder.');
  }
  if (root.path === null) {
    throw new ApiError('invalid_request', 'This library folder has no folder on the hub.');
  }
  return { ...root, path: root.path };
}

function syncPatch(root: PhysicalRoot, change: DriveRootChange): DriveRootPatch {
  const synced = change.synced ?? root.synced;
  const touchesSettings =
    change.ignorePatterns !== undefined || change.conflictCopies !== undefined;
  if (!synced) {
    if (touchesSettings) {
      throw new ApiError(
        'invalid_request',
        'Sync patterns and conflict copies apply only while the folder syncs.',
      );
    }
    return change.synced === false ? { sync: null } : {};
  }
  if (change.synced === undefined && !touchesSettings) {
    return {};
  }
  return {
    sync: {
      ...root.sync,
      ignorePatterns: change.ignorePatterns ?? root.sync.ignorePatterns,
      conflictCopies: change.conflictCopies ?? root.sync.conflictCopies,
    },
  };
}

function accessPatch(root: PhysicalRoot, change: DriveRootChange): DriveRootPatch {
  const readOnly = change.readOnly ?? root.readOnly;
  const versions = change.versions ?? (readOnly ? false : root.versions);
  if (root.kind === 'managed' && readOnly) {
    throw new ApiError('invalid_request', 'A managed folder is always writable.');
  }
  if (readOnly && versions) {
    throw new ApiError(
      'invalid_request',
      'A read-only folder keeps no versions because the hub never writes there.',
    );
  }
  return { readOnly, versions };
}

function rootPatch(root: PhysicalRoot, change: DriveRootChange): DriveRootPatch {
  const patch: MutablePatch = { ...accessPatch(root, change), ...syncPatch(root, change) };
  if (change.label !== undefined) patch.label = change.label;
  if (change.inPhotos !== undefined) patch.inPhotos = change.inPhotos;
  if (change.skipPatterns !== undefined) patch.skipPatterns = change.skipPatterns;
  if (change.includeHidden !== undefined) patch.includeHidden = change.includeHidden;
  return patch;
}

function needsRescan(change: DriveRootChange): boolean {
  return change.skipPatterns !== undefined || change.includeHidden !== undefined;
}

async function describe(
  input: DriveRootAdd,
  ids: { readonly id: string; readonly indexId: string },
  real: string,
  probe: VolumeProbe,
): Promise<DriveRoot> {
  return DRIVE_ROOT.parse({
    ...ids,
    kind: input.kind,
    label: input.label,
    scope: input.scope,
    ownerProfileId: input.ownerProfileId,
    path: real,
    readOnly: input.readOnly,
    versions: input.versions,
    volume: await volumeRecord(real, probe),
    state: 'scanning',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: { hashedShare: 0, verifiedShare: 0, corrupt: 0, lastScrubAt: null, lastBackupAt: null },
    inPhotos: input.inPhotos,
    skipPatterns: input.skipPatterns,
    includeHidden: input.includeHidden,
    synced: false,
    sync: UNSYNCED,
  });
}

export class DriveRootAdmin {
  constructor(private readonly deps: RootAdminDeps) {}

  async add(caller: DriveCaller, input: DriveRootAdd): Promise<DriveRoot> {
    requireOwner(caller);
    const { store, probe, newId } = this.deps;
    const real = await checkRootPlacement({
      candidate: input.path,
      layout: this.deps.layout,
      hubInstallDirectory: this.deps.installDirectory,
      existingRoots: store.driveRoots
        .list()
        .flatMap((root) => (root.path === null ? [] : [root.path])),
    });
    const root = await describe(input, { id: newId(), indexId: newId() }, real, probe);
    const inserted = store.driveRoots.insert(root);
    try {
      await this.markNew(root.id, real, input.readOnly);
    } catch (cause) {
      store.driveRoots.remove(root.id);
      throw cause;
    }
    this.deps.scan(root.id);
    return inserted;
  }

  async update(caller: DriveCaller, rootId: string, change: DriveRootChange): Promise<DriveRoot> {
    requireOwner(caller);
    const root = physicalOf(this.deps.store.driveRoots.find(rootId));
    const patch = rootPatch(root, change);
    if (change.readOnly !== undefined && change.readOnly !== root.readOnly) {
      await this.switchAccess(root, change.readOnly);
    }
    const updated = this.deps.store.driveRoots.update(rootId, patch);
    if (needsRescan(change)) {
      this.deps.scan(rootId);
    }
    return updated;
  }

  async remove(caller: DriveCaller, rootId: string): Promise<void> {
    requireOwner(caller);
    const root = physicalOf(this.deps.store.driveRoots.find(rootId));
    if (root.kind === 'managed') {
      throw new ApiError('invalid_request', 'A managed folder belongs to the hub and stays.');
    }
    await this.releaseMarker(root);
    this.deps.store.driveRoots.remove(rootId);
    await this.dropLinkedRecord(rootId);
    this.deps.rearmPurge();
  }

  scan(caller: DriveCaller, rootId: string): void {
    requireOwner(caller);
    physicalOf(this.deps.store.driveRoots.find(rootId));
    this.deps.scan(rootId);
  }

  private async markNew(rootId: string, path: string, readOnly: boolean): Promise<void> {
    if (readOnly) {
      await writeLinkedRecord(this.deps.layout, rootId, path, this.deps.probe);
    } else {
      await writeRootMarker(path, rootId);
    }
  }

  private async switchAccess(root: PhysicalRoot, readOnly: boolean): Promise<void> {
    if (readOnly) {
      await writeLinkedRecord(this.deps.layout, root.id, root.path, this.deps.probe);
      return;
    }
    await this.ensureMarker(root.id, root.path);
    await this.dropLinkedRecord(root.id);
  }

  private async dropLinkedRecord(rootId: string): Promise<void> {
    await removeLinkedRecord(this.deps.layout, rootId);
  }

  private async releaseMarker(root: PhysicalRoot): Promise<void> {
    if (root.readOnly) {
      return;
    }
    const marker = await readRootMarker(root.path).catch((cause: unknown) => {
      if (cause instanceof RootMarkerError && cause.failure === 'missing') {
        return null;
      }
      throw cause;
    });
    if (marker?.id === root.id) {
      await rm(join(root.path, MARKER_FILE), { force: true });
    }
  }

  private async ensureMarker(rootId: string, path: string): Promise<void> {
    try {
      const marker = await readRootMarker(path);
      if (marker.id !== rootId) {
        throw new RootMarkerError('mismatch', 'The folder already belongs to another root.');
      }
    } catch (cause) {
      if (cause instanceof RootMarkerError && cause.failure === 'missing') {
        await writeRootMarker(path, rootId);
        return;
      }
      throw cause;
    }
  }
}
