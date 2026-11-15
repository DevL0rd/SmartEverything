import type {
  BackupCheck,
  BackupHave,
  BackupHaveResult,
  BackupRegister,
  PhotoFolderCopies,
  PhotoFolderCopiesRequest,
  PhotoFolderOrigin,
  PhotoOrigins,
  PhotoOriginsRequest,
} from '@smarteverything/domain';
import type { UploadHandle, UploadOutcome } from '../../../drive';
import type { Conditions, MediaAccess, MediaRow, MediaScope, MediaStat } from '../model/types';
import type {
  BackupHubPort,
  BackupPorts,
  BackupUploadRequest,
  ConditionsPort,
  LedgerFile,
  LedgerStorage,
  LocalTrashPort,
  LocalTrashResult,
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

export const CAMERA_PATH = 'DCIM/Camera/';

export class FakeLibrary implements MediaLibraryPort {
  rows: MediaRow[] = [];
  readonly paths = new Map<string, string>();
  level: MediaAccess = 'all';
  pageSize = 2;
  pagesRead = 0;
  removeAnswer = true;
  readonly removed: string[] = [];
  readonly removeCalls: string[][] = [];
  readonly timeLookups: string[][] = [];
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

  pathOf(id: string): string {
    return this.paths.get(id) ?? CAMERA_PATH;
  }

  private visible(scope: MediaScope): MediaRow[] {
    return this.rows.filter(
      (row) =>
        (scope.includeVideos || row.kind === 'photo') &&
        (scope.albumIds.length === 0 || scope.albumIds.includes(this.pathOf(row.id))),
    );
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

  modificationTimes(localIds: readonly string[]): Promise<ReadonlyMap<string, number>> {
    this.timeLookups.push([...localIds]);
    return Promise.resolve(
      new Map(
        this.rows
          .filter((row) => localIds.includes(row.id))
          .map((row) => [row.id, row.modificationTime]),
      ),
    );
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  remove(localIds: readonly string[]): Promise<boolean> {
    this.removeCalls.push([...localIds]);
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
          relativePath: this.library.pathOf(id),
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
  readonly folders: (PhotoFolderOrigin | null)[] = [];
  readonly targets: string[] = [];
  registerError: Error | null = null;

  register(input: BackupRegister): Promise<unknown> {
    if (this.registerError !== null) return Promise.reject(this.registerError);
    this.registered.push(input);
    return Promise.resolve({});
  }

  lookupHashes(input: BackupHave): Promise<BackupHaveResult> {
    return this.answer(input, 'lookup');
  }

  checkBackup(input: BackupCheck): Promise<BackupHaveResult> {
    this.folders.push(...input.assets.map((asset) => asset.folder));
    for (const asset of input.assets) {
      if (asset.folder !== null && this.held.has(asset.sha256))
        this.known.set(ITEM_ID, asset.folder);
    }
    return this.answer(input, 'backup');
  }

  private answer(input: BackupHave, purpose: 'lookup' | 'backup'): Promise<BackupHaveResult> {
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

  readonly copyAsks: PhotoFolderCopiesRequest[] = [];
  copies: PhotoFolderCopies = { items: [], kept: [] };

  folderCopies(input: PhotoFolderCopiesRequest): Promise<PhotoFolderCopies> {
    this.copyAsks.push(input);
    return Promise.resolve(this.copies);
  }

  readonly known = new Map<string, PhotoFolderOrigin>();
  readonly originAsks: PhotoOriginsRequest[] = [];

  origins(input: PhotoOriginsRequest): Promise<PhotoOrigins> {
    this.originAsks.push(input);
    return Promise.resolve({
      origins: input.itemIds.map((itemId) => ({ itemId, folder: this.known.get(itemId) ?? null })),
    });
  }
}

export class FakeTrash implements LocalTrashPort {
  outcome: LocalTrashResult['outcome'] = 'done';
  readonly calls: { readonly ids: readonly string[]; readonly trash: boolean }[] = [];

  constructor(private readonly library: FakeLibrary) {}

  private change(ids: readonly string[], trash: boolean): Promise<LocalTrashResult> {
    this.calls.push({ ids: [...ids], trash });
    if (this.outcome !== 'done') return Promise.resolve({ outcome: this.outcome, localIds: [] });
    if (trash) this.library.rows = this.library.rows.filter((row) => !ids.includes(row.id));
    return Promise.resolve({ outcome: 'done', localIds: [...ids] });
  }

  trash(ids: readonly string[]): Promise<LocalTrashResult> {
    return this.change(ids, true);
  }

  untrash(ids: readonly string[]): Promise<LocalTrashResult> {
    return this.change(ids, false);
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

  removeItem(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }
}

export class MemoryLedgerFile implements LedgerFile {
  text: string | null = null;

  read(): Promise<string | null> {
    return Promise.resolve(this.text);
  }

  write(text: string): Promise<void> {
    this.text = text;
    return Promise.resolve();
  }
}

export interface Rig {
  readonly library: FakeLibrary;
  readonly native: FakeNative;
  readonly trash: FakeTrash;
  readonly hub: FakeHub;
  readonly upload: FakeUpload;
  readonly conditions: FakeConditions;
  readonly settings: FakeSettings;
  readonly storage: MemoryStorage;
  readonly ledgerFile: MemoryLedgerFile;
  readonly ports: BackupPorts;
  readonly runner: BackupRunner;
  available: boolean;
}

export function rig(platform: 'android' | 'ios' | 'desktop' = 'android'): Rig {
  const library = new FakeLibrary();
  const native = new FakeNative(library);
  const trash = new FakeTrash(library);
  const hub = new FakeHub();
  const upload = new FakeUpload();
  upload.hub = hub;
  const conditions = new FakeConditions();
  const settings = new FakeSettings();
  const storage = new MemoryStorage();
  const ledgerFile = new MemoryLedgerFile();
  const state = { available: true };
  const ports: BackupPorts = {
    media: library,
    native,
    trash,
    conditions,
    upload,
    hub,
    settings,
    storage,
    ledgerFile,
    identity: { deviceId: 'phone-1', name: 'Test phone', platform },
    available: () => state.available,
    now: () => new Date('2026-11-07T10:00:00.000Z'),
  };
  return {
    library,
    native,
    trash,
    hub,
    upload,
    conditions,
    settings,
    storage,
    ledgerFile,
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
