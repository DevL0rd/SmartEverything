import { Logger, background } from '@smarteverything/logging';
import { ValueStore, usePausable } from '../../../design/external-store';
import { notify } from '../../../components/toast-store';
import type { PickedBlob } from '../../../platform/pick-files';
import {
  dismissUpload,
  startUpload,
  uploadEntries,
  useUploadEntries,
  type UploadHandle,
  type UploadRequest,
} from './transport';
import type { DriveFolderPlace } from '@smarteverything/domain';
import {
  identityOf,
  nextClock,
  placeIdOf,
  rowsOf,
  summaryOf,
  type RateClock,
  type UploadRecord,
  type UploadRow,
  type UploadSummary,
} from './upload-model';

const log = new Logger('app.drive');

export interface DriveUploadDeps {
  readonly start: (request: UploadRequest) => UploadHandle;
  readonly now: () => number;
}

const LIVE: DriveUploadDeps = { start: startUpload, now: () => Date.now() };

export interface DriveUploadsState {
  readonly records: readonly UploadRecord[];
  readonly clocks: ReadonlyMap<string, RateClock>;
}

export const EMPTY_UPLOADS: DriveUploadsState = { records: [], clocks: new Map() };

export const driveUploads = new ValueStore<DriveUploadsState>(EMPTY_UPLOADS);

const handles = new Map<string, UploadHandle>();

const requests = new Map<string, UploadRequest>();

let sequence = 0;

let unwatch: (() => void) | null = null;

function placeIdsOf(records: readonly UploadRecord[]): ReadonlySet<string> {
  return new Set(records.map((record) => placeIdOf(record.place)));
}

function clocksOf(state: DriveUploadsState, now: number): ReadonlyMap<string, RateClock> {
  const entries = uploadEntries.get();
  const clocks = new Map<string, RateClock>();
  for (const placeId of placeIdsOf(state.records)) {
    const summary = summaryOf(rowsOf(state.records, entries, placeId));
    const clock = nextClock(state.clocks.get(placeId), summary.sending > 0, summary.sent, now);
    if (clock !== undefined) clocks.set(placeId, clock);
  }
  return clocks;
}

let now = LIVE.now;

function watch(deps: DriveUploadDeps): void {
  now = deps.now;
  if (unwatch !== null) return;
  unwatch = uploadEntries.subscribe(() => {
    driveUploads.update((state) => ({ ...state, clocks: clocksOf(state, now()) }));
  });
}

function setRecords(change: (records: readonly UploadRecord[]) => readonly UploadRecord[]): void {
  driveUploads.update((state) => ({ ...state, records: change(state.records) }));
  if (driveUploads.get().records.length > 0 || unwatch === null) return;
  unwatch();
  unwatch = null;
  driveUploads.set(EMPTY_UPLOADS);
}

function patchRecord(key: string, handleId: string): void {
  setRecords((records) =>
    records.map((record) => (record.key === key ? { ...record, handleId } : record)),
  );
}

function recordOf(key: string): UploadRecord | undefined {
  return driveUploads.get().records.find((record) => record.key === key);
}

function forget(key: string): void {
  const handleId = recordOf(key)?.handleId ?? null;
  if (handleId !== null) dismissUpload(handleId);
  handles.delete(key);
  requests.delete(key);
  setRecords((records) => records.filter((item) => item.key !== key));
}

function begin(key: string, request: UploadRequest, deps: DriveUploadDeps): void {
  const handle = deps.start(request);
  handles.set(key, handle);
  requests.set(key, request);
  patchRecord(key, handle.id);
  watch(deps);
  background(
    handle.outcome.then((outcome) => {
      if (handles.get(key) === handle) handles.delete(key);
      if (outcome.kind !== 'failed') requests.delete(key);
      log.info('drive.upload.settled', { outcome: outcome.kind });
    }),
    'drive.upload.settle_failed',
  );
}

function modifiedOf(source: Blob): number | null {
  return 'lastModified' in source && typeof source.lastModified === 'number'
    ? source.lastModified
    : null;
}

async function sendOne(
  file: PickedBlob,
  record: UploadRecord,
  deps: DriveUploadDeps,
): Promise<void> {
  try {
    const source = await file.blob();
    if (recordOf(record.key) === undefined) return;
    begin(
      record.key,
      {
        identity: identityOf(file.name, placeIdOf(record.place), modifiedOf(source)),
        source,
        name: file.name,
        target: record.place,
      },
      deps,
    );
  } catch (error) {
    forget(record.key);
    notify({ message: `${file.name} couldn’t be read`, error, tone: 'critical' });
  }
}

export function uploadFiles(
  files: readonly PickedBlob[],
  place: DriveFolderPlace,
  deps: DriveUploadDeps = LIVE,
): Promise<number> {
  const added = files.map((file): UploadRecord => {
    sequence += 1;
    return {
      key: `drive-file-${String(sequence)}`,
      place,
      name: file.name,
      size: file.bytes,
      handleId: null,
    };
  });
  if (added.length === 0) return Promise.resolve(0);
  setRecords((records) => [...records, ...added]);
  log.info('drive.upload.started', { files: added.length });
  return Promise.all(
    files.map((file, index) => {
      const record = added[index];
      return record === undefined ? Promise.resolve() : sendOne(file, record, deps);
    }),
  ).then(() => added.length);
}

export function pauseUpload(key: string): void {
  const handle = handles.get(key);
  if (handle !== undefined) background(handle.pause(), 'drive.upload.pause_failed');
}

export function resumeUpload(key: string): void {
  handles.get(key)?.resume();
}

export function cancelUpload(key: string): void {
  const handle = handles.get(key);
  forget(key);
  if (handle !== undefined) background(handle.cancel(), 'drive.upload.cancel_failed');
}

export function retryUpload(key: string, deps: DriveUploadDeps = LIVE): void {
  const record = recordOf(key);
  const request = requests.get(key);
  if (record === undefined || request === undefined || handles.has(key)) return;
  if (record.handleId !== null) dismissUpload(record.handleId);
  begin(key, request, deps);
}

function keysOf(placeId: string): readonly string[] {
  return driveUploads
    .get()
    .records.filter((record) => placeIdOf(record.place) === placeId)
    .map((record) => record.key);
}

export function pauseFolder(placeId: string): void {
  for (const key of keysOf(placeId)) pauseUpload(key);
}

export function resumeFolder(placeId: string): void {
  for (const key of keysOf(placeId)) resumeUpload(key);
}

export function retryFolder(rows: readonly UploadRow[], deps: DriveUploadDeps = LIVE): void {
  for (const row of rows) {
    if (row.state.kind === 'failed' && row.state.retryable) retryUpload(row.key, deps);
  }
}

export function retryFolderId(placeId: string, deps: DriveUploadDeps = LIVE): void {
  retryFolder(rowsOf(driveUploads.get().records, uploadEntries.get(), placeId), deps);
}

export function clearFolder(rows: readonly UploadRow[]): void {
  for (const row of rows) {
    if (!handles.has(row.key) && row.state.kind !== 'waiting') forget(row.key);
  }
}

export interface FolderUploadsView {
  readonly rows: readonly UploadRow[];
  readonly summary: UploadSummary;
  readonly rate: number | null;
}

export function useFolderUploads(placeId: string): FolderUploadsView {
  const state = usePausable(driveUploads.subscribe, driveUploads.get);
  const entries = useUploadEntries();
  const rows = rowsOf(state.records, entries, placeId);
  return { rows, summary: summaryOf(rows), rate: state.clocks.get(placeId)?.rate ?? null };
}
