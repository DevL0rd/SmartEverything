import {
  DRIVE_MOUNT_NAME,
  syncingProgress,
  syncingWords,
  type DesktopDriveFolderSyncing,
  type DesktopDriveState,
  type DesktopDriveSyncing,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { BrowserWindow } from 'electron';
import type { SyncJob, SyncJobEnd, SyncJobProgress, SyncJobs, SyncJobsStatus } from './kde-jobs.js';

const log = new Logger('desktop.tray');
const MOUNT_KEY = 'mount';

interface MountSync {
  readonly mounted: boolean;
  readonly syncing: DesktopDriveSyncing | null;
}

type FolderSync = DesktopDriveState['sync'];

interface Activity {
  readonly key: string;
  readonly name: string;
  readonly syncing: DesktopDriveSyncing;
  readonly current: string | null;
}

interface Live {
  latest: Activity;
  readonly job: SyncJob;
}

function percentOf(syncing: DesktopDriveSyncing): string {
  return `${String(Math.floor(syncingProgress(syncing) * 100))}%`;
}

export function syncTipOf(state: MountSync | null): string | null {
  if (state?.syncing === undefined || state.syncing === null) return null;
  return `${syncingWords(state.syncing)}, ${percentOf(state.syncing)}`;
}

export function syncProgressLabel(syncing: DesktopDriveSyncing): string {
  return `${percentOf(syncing)} sent`;
}

function filesLeft(syncing: DesktopDriveSyncing): string {
  return `${String(syncing.files)} ${syncing.files === 1 ? 'file' : 'files'} left`;
}

export function folderProgressLabel(folder: DesktopDriveFolderSyncing): string {
  return `${folder.name}: ${percentOf(folder)} · ${filesLeft(folder)}`;
}

function titleOf(activity: Activity): string {
  return `Syncing ${activity.name}`;
}

function jobProgressOf(activity: Activity): SyncJobProgress {
  const { syncing } = activity;
  return {
    title: titleOf(activity),
    percent: syncingProgress(syncing) * 100,
    processedBytes: syncing.sentBytes,
    totalBytes: syncing.sentBytes + syncing.bytes,
    processedFiles: syncing.sentFiles,
    totalFiles: syncing.sentFiles + syncing.files,
    bytesPerSecond: syncing.bytesPerSecond,
    current: activity.current,
    info: filesLeft(syncing),
  };
}

export function jobProgressLabel(status: SyncJobsStatus): string | null {
  return status.state === 'unavailable'
    ? `Sync progress in notifications is unavailable: ${status.reason}`
    : null;
}

export class DriveSyncNotices {
  private readonly live = new Map<string, Live>();
  private mountState: MountSync | null = null;
  private folderState: FolderSync = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly jobs: SyncJobs,
  ) {}

  mount(state: MountSync | null): void {
    const before = this.mountState;
    this.mountState = state;
    if (state !== null && state.syncing !== null) {
      this.see({ key: MOUNT_KEY, name: DRIVE_MOUNT_NAME, syncing: state.syncing, current: null });
    } else if (before !== null && before.syncing !== null && state?.mounted === true) {
      this.end(MOUNT_KEY, { kind: 'done' });
    } else {
      this.end(MOUNT_KEY, { kind: 'failed', message: `${DRIVE_MOUNT_NAME} went offline` });
    }
    this.showProgress();
  }

  folders(state: FolderSync): void {
    const before = this.folderState;
    this.folderState = state;
    const end = this.folderEndOf(before, state);
    const syncing = state === null || state.paused ? [] : state.folders;
    for (const key of [...this.live.keys()]) {
      if (key === MOUNT_KEY || syncing.some((folder) => folder.placementId === key)) continue;
      this.end(key, end);
    }
    for (const folder of syncing) {
      this.see({
        key: folder.placementId,
        name: folder.name,
        syncing: folder,
        current: folder.current,
      });
    }
    this.showProgress();
  }

  private folderEndOf(before: FolderSync, state: FolderSync): SyncJobEnd {
    if (state === null) {
      return { kind: 'failed', message: 'The Computer service went offline' };
    }
    if (state.paused) return { kind: 'paused' };
    if (state.failures > (before === null ? 0 : before.failures)) {
      const files = `${String(state.failures)} ${state.failures === 1 ? 'file needs' : 'files need'}`;
      return { kind: 'failed', message: `${files} attention` };
    }
    return { kind: 'done' };
  }

  private see(activity: Activity): void {
    const live = this.live.get(activity.key);
    if (live === undefined) {
      this.live.set(activity.key, {
        latest: activity,
        job: this.jobs.open(jobProgressOf(activity)),
      });
      log.info('tray.drive_sync_started', { key: activity.key });
      return;
    }
    live.latest = activity;
    live.job.update(jobProgressOf(activity));
  }

  private end(key: string, end: SyncJobEnd): void {
    const live = this.live.get(key);
    if (live === undefined) return;
    this.live.delete(key);
    live.job.finish(end);
    const files = live.latest.syncing.sentFiles + live.latest.syncing.files;
    log.info('tray.drive_sync_ended', { key, files, end: end.kind });
  }

  private showProgress(): void {
    if (this.window.isDestroyed()) return;
    let sent = 0;
    let total = 0;
    let sentFiles = 0;
    let files = 0;
    for (const { latest } of this.live.values()) {
      sent += latest.syncing.sentBytes;
      total += latest.syncing.sentBytes + latest.syncing.bytes;
      sentFiles += latest.syncing.sentFiles;
      files += latest.syncing.sentFiles + latest.syncing.files;
    }
    if (files === 0) {
      this.window.setProgressBar(-1);
      return;
    }
    this.window.setProgressBar(total > 0 ? sent / total : sentFiles / files);
  }
}
