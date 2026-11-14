import type { BackupHave, BackupHaveResult, BackupRegister } from '@smarteverything/domain';
import type { UploadHandle, UploadOutcome } from '../../../drive';
import type { Conditions, MediaAccess, MediaRow, MediaScope, MediaStat } from '../model/types';
import type {
  BackupHubPort,
  BackupPorts,
  BackupUploadRequest,
  ConditionsPort,
  LedgerStorage,
  MediaLibraryPort,
  NativeMediaPort,
  SettingsPort,
} from './ports';
import { BackupRunner } from './runner';

export const FOLDER_ID = 'a1b2c3d4-0000-4000-8000-0000000000bb';
export const ITEM_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';

export function digestOf(text: string): string {
  let state = 0;
  let hex = '';
  for (let round = 0; hex.length < 64; round += 1) {
    for (const character of `${text}:${String(round)}`) {
      state = (state * 31 + character.charCodeAt(0)) % 4294967291;
    }
    hex += state.toString(16).padStart(8, '0');
  }
  return hex.slice(0, 64);
}

export function rowOf(
  id: string,
  modificationTime: number,
  kind: 'photo' | 'video' = 'photo',
): MediaRow {
  return {
    id,
    filename: `${id}.${kind === 'photo' ? 'jpg' : 'mp4'}`,
    kind,
    creationTime: modificationTime - 1000,
    modificationTime,
  };
}

export class FakeLibrary implements MediaLibraryPort {
  rows: MediaRow[] = [];
  level: MediaAccess = 'all';
  pageSize = 2;
  pagesRead = 0;
  removeAnswer = true;
  readonly removed: string[] = [];
  readonly listeners = new Set<() => void>();
  picked = 0;

  access(): Promise<MediaAccess> {
    return Promise.resolve(this.level);
  }

  requestAccess(): Promise<MediaAccess> {
    return Promise.resolve(this.level);
  }

  presentPicker(): Promise<void> {
    this.picked += 1;
    return Promise.resolve();
  }

  private visible(scope: MediaScope): MediaRow[] {
    return this.rows.filter((row) => scope.includeVideos || row.kind === 'photo');
  }

  listIds(scope: MediaScope): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set(this.visible(scope).map((row) => row.id)));
  }

  async *pagesFrom(scope: MediaScope, modifiedFrom: number): AsyncGenerator<readonly MediaRow[]> {
    const ordered = this.visible(scope)
      .filter((row) => row.modificationTime >= modifiedFrom)
      .sort((left, right) => left.modificationTime - right.modificationTime);
    for (let at = 0; at < ordered.length; at += this.pageSize) {
      this.pagesRead += 1;
      await Promise.resolve();
      yield ordered.slice(at, at + this.pageSize);
    }
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  remove(localIds: readonly string[]): Promise<boolean> {
    if (this.removeAnswer) {
      this.removed.push(...localIds);
      this.rows = this.rows.filter((row) => !localIds.includes(row.id));
    }
    return Promise.resolve(this.removeAnswer);
  }

  emitChange(): void {
    for (const listener of this.listeners) listener();
  }
}

export class FakeNative implements NativeMediaPort {
  readonly sizes = new Map<string, number>();
  readonly pending = new Set<string>();
  readonly trashed = new Set<string>();
  readonly unreadable = new Set<string>();
  hashed: string[] = [];

  constructor(private readonly library: FakeLibrary) {}

  statMedia(localIds: readonly string[]): Promise<readonly MediaStat[]> {
    const stats = localIds.flatMap((id) => {
      const row = this.library.rows.find((candidate) => candidate.id === id);
      if (row === undefined) return [];
      return [
        {
          id,
          bytes: this.sizes.get(id) ?? 1000,
          mimeType: row.kind === 'photo' ? 'image/jpeg' : 'video/mp4',
          relativePath: 'DCIM/Camera/',
          dateAddedSeconds: 1,
          modifiedSeconds: row.modificationTime,
          isTrashed: this.trashed.has(id),
          isPending: this.pending.has(id),
        },
      ];
    });
    return Promise.resolve(stats);
  }

  hashFile(uri: string): Promise<{ readonly sha256: string; readonly bytes: number }> {
    this.hashed.push(uri);
    if (this.unreadable.has(uri)) return Promise.reject(new Error('cannot open the file'));
    const row = this.library.rows.find((candidate) => candidate.id === uri);
    const version = row === undefined ? 0 : row.modificationTime;
    return Promise.resolve({
      sha256: digestOf(`${uri}@${String(version)}`),
      bytes: this.sizes.get(uri) ?? 1000,
    });
  }
}

export class FakeHub implements BackupHubPort {
  readonly held = new Set<string>();
  readonly registered: BackupRegister[] = [];
  readonly checks: BackupHave[] = [];
  readonly checkPurposes: ('lookup' | 'backup')[] = [];
  readonly targets: string[] = [];
  registerError: Error | null = null;

  register(input: BackupRegister): Promise<unknown> {
    if (this.registerError !== null) return Promise.reject(this.registerError);
    this.registered.push(input);
    return Promise.resolve({});
  }

  checkHashes(input: BackupHave, purpose: 'lookup' | 'backup'): Promise<BackupHaveResult> {
    this.checks.push(input);
    this.checkPurposes.push(purpose);
    const have = input.assets
      .filter((asset) => this.held.has(asset.sha256))
      .map((asset) => ({ localId: asset.localId, itemId: ITEM_ID }));
    const kept = new Set(have.map((entry) => entry.localId));
    return Promise.resolve({
      have,
      missing: input.assets.map((asset) => asset.localId).filter((id) => !kept.has(id)),
    });
  }

  resolveTarget(_deviceId: string, takenAt: string): Promise<{ readonly folderId: string }> {
    this.targets.push(takenAt);
    return Promise.resolve({ folderId: FOLDER_ID });
  }
}

export class FakeUpload {
  readonly started: BackupUploadRequest[] = [];
  readonly paused: string[] = [];
  answers = new Map<string, UploadOutcome>();
  hub: FakeHub | null = null;
  holdOpen = false;
  private release: () => void = () => undefined;

  open(): void {
    this.release();
  }

  start = (request: BackupUploadRequest): UploadHandle => {
    this.started.push(request);
    const answer = this.answers.get(request.uri) ?? {
      kind: 'done',
      itemId: ITEM_ID,
      name: request.name,
      renamed: false,
    };
    const outcome = new Promise<UploadOutcome>((resolve) => {
      if (!this.holdOpen) {
        this.hub?.held.add(request.sha256);
        resolve(answer);
        return;
      }
      this.release = (): void => {
        resolve(answer);
      };
    });
    return {
      id: `fake-${request.uri}`,
      outcome,
      pause: (): Promise<void> => {
        this.paused.push(request.uri);
        return Promise.resolve();
      },
      resume: (): void => undefined,
      cancel: (): Promise<void> => Promise.resolve(),
    };
  };
}

export class FakeConditions implements ConditionsPort {
  current: Conditions = { connected: true, wifi: true, metered: false, charging: true };
  readonly listeners = new Set<() => void>();

  read(): Promise<Conditions> {
    return Promise.resolve(this.current);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  change(next: Partial<Conditions>): void {
    this.current = { ...this.current, ...next };
    for (const listener of this.listeners) listener();
  }
}

export class FakeSettings implements SettingsPort {
  value: ReturnType<SettingsPort['read']> = {
    enabled: true,
    albumIds: [],
    wifiOnly: true,
    chargingOnly: false,
    includeVideos: true,
  };
  readonly listeners = new Set<() => void>();

  read(): ReturnType<SettingsPort['read']> {
    return this.value;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  change(next: Partial<ReturnType<SettingsPort['read']>>): void {
    this.value = { ...this.value, ...next };
    for (const listener of this.listeners) listener();
  }
}

export class MemoryStorage implements LedgerStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null);
  }

  setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

export interface Rig {
  readonly library: FakeLibrary;
  readonly native: FakeNative;
  readonly hub: FakeHub;
  readonly upload: FakeUpload;
  readonly conditions: FakeConditions;
  readonly settings: FakeSettings;
  readonly storage: MemoryStorage;
  readonly ports: BackupPorts;
  readonly runner: BackupRunner;
  available: boolean;
}

export function rig(platform: 'android' | 'ios' = 'android'): Rig {
  const library = new FakeLibrary();
  const native = new FakeNative(library);
  const hub = new FakeHub();
  const upload = new FakeUpload();
  upload.hub = hub;
  const conditions = new FakeConditions();
  const settings = new FakeSettings();
  const storage = new MemoryStorage();
  const state = { available: true };
  const ports: BackupPorts = {
    media: library,
    native,
    conditions,
    upload,
    hub,
    settings,
    storage,
    identity: { deviceId: 'phone-1', name: 'Test phone', platform },
    available: () => state.available,
    now: () => new Date('2026-11-07T10:00:00.000Z'),
  };
  return {
    library,
    native,
    hub,
    upload,
    conditions,
    settings,
    storage,
    ports,
    runner: new BackupRunner(ports),
    get available(): boolean {
      return state.available;
    },
    set available(value: boolean) {
      state.available = value;
    },
  };
}
