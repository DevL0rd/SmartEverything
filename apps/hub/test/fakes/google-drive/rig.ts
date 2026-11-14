import { randomUUID } from 'node:crypto';
import type { DestinationEnv } from '../../../src/drive/google/destination';
import type { ImportSelection } from '../../../src/drive/google/ledger';
import {
  GoogleImportService,
  type GoogleImportDeps,
  type ImportProgress,
} from '../../../src/drive/google/service';
import type { DriveWriteRoot } from '../../../src/drive/intents';
import { ensureDrives, personalDrive } from '../../../src/drive/spaces';
import { nodeFiles } from '../../../src/drive/versions';
import { testLogger } from '../../support/logs';
import { testStore, type TestStore } from '../../support/store';
import { DRIVE_CLIENT, createFakeGoogleDrive, type FakeGoogleDrive } from './index';
import { MemoryLedger } from './memory-ledger';

export const REDIRECT = 'http://127.0.0.1:8123/google-import/callback';
const START = new Date('2026-11-08T00:00:00.000Z');

export interface Rig {
  readonly store: TestStore;
  readonly fake: FakeGoogleDrive;
  readonly ledger: MemoryLedger;
  readonly service: GoogleImportService;
  readonly profileId: string;
  readonly rootPath: string;
  readonly rootId: string;
  readonly reports: ImportProgress[];
  readonly waits: Waits;
  start(selection: ImportSelection): { importId: string; authorizationUrl: string };
  consent(url: string, only?: readonly string[]): { state: string; code: string };
  run(selection: ImportSelection): Promise<string>;
  close(): Promise<void>;
}

function holds(
  opened: TestStore,
  rootId: string,
  sha256: string,
  parentId: string | null,
): boolean {
  const { entries } = opened.store.driveItems.children({
    rootId: rootId,
    parentId: parentId,
    after: null,
    limit: 10_000,
    viewer: null,
  });
  return entries.some(({ item }) =>
    item.kind === 'folder' ? holds(opened, rootId, sha256, item.id) : item.sha256 === sha256,
  );
}

export class Waits {
  calls = 0;
  onWait: (() => void) | null = null;

  readonly wait = (_ms: number, signal: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
      this.calls += 1;
      if (signal.aborted) {
        reject(new Error('aborted'));
        return;
      }
      signal.addEventListener('abort', () => {
        reject(new Error('aborted'));
      });
      this.onWait?.();
      queueMicrotask(resolve);
    });
}

interface RigOptions {
  readonly library?: boolean;
  readonly quota?: number;
}

function destinationOf(
  opened: TestStore,
  profileId: string,
  root: DriveWriteRoot,
  options: RigOptions,
): DestinationEnv {
  return {
    files: nodeFiles,
    store: opened.store,
    log: testLogger('drive'),
    now: () => START,
    purge: { rearm: (): void => undefined },
    rootOf: (id) => (options.library === false || id !== profileId ? null : root),
    held: (id, sha256) =>
      id === profileId && holds(opened, root.id, sha256, null) ? sha256 : null,
    guard: {
      status: (id) => ({
        quota: options.quota ?? null,
        usage: { profileId: id, items: 0, folders: 0, live: 0, versions: 0, trash: 0 },
      }),
      space: () =>
        Promise.resolve({
          totalBytes: Number.MAX_SAFE_INTEGER,
          freeBytes: Number.MAX_SAFE_INTEGER,
        }),
    },
  };
}

function consentOn(fake: FakeGoogleDrive): Rig['consent'] {
  return (url, only) => {
    const redirect = new URL(fake.oauth.consent(url, only).redirectUrl);
    return {
      state: redirect.searchParams.get('state') ?? '',
      code: redirect.searchParams.get('code') ?? '',
    };
  };
}

async function openLibrary(
  opened: TestStore,
): Promise<{ readonly root: DriveWriteRoot; readonly profileId: string }> {
  const profileId = opened.store.profiles.first().id;
  await ensureDrives(opened.store, opened.layout, opened.store.profiles.list());
  const drive = personalDrive(opened.store, profileId);
  opened.store.driveRoots.update(drive.id, { versions: true });
  return { root: { id: drive.id, path: drive.path, versions: true }, profileId };
}

function serviceOn(
  deps: Pick<GoogleImportDeps, 'destination' | 'fetch' | 'ledger' | 'report'>,
  waits: Waits,
): GoogleImportService {
  return new GoogleImportService({
    ...deps,
    client: () => DRIVE_CLIENT,
    newId: randomUUID,
    now: () => START,
    wait: waits.wait,
    log: testLogger('google-import'),
  });
}

export async function openRig(options: RigOptions = {}): Promise<Rig> {
  const opened = await testStore();
  const fake = createFakeGoogleDrive();
  const ledger = new MemoryLedger();
  const { root, profileId } = await openLibrary(opened);
  const reports: ImportProgress[] = [];
  const waits = new Waits();
  const service = serviceOn(
    {
      ledger,
      fetch: fake.fetch,
      destination: destinationOf(opened, profileId, root, options),
      report: (progress): void => {
        reports.push(progress);
      },
    },
    waits,
  );
  const consent = consentOn(fake);
  const start: Rig['start'] = (selection) =>
    service.begin({ profileId, selection, redirectUri: REDIRECT });
  const run: Rig['run'] = async (selection) => {
    const started = start(selection);
    await service.complete({
      profileId,
      ...consent(started.authorizationUrl),
      redirectUri: REDIRECT,
    });
    await service.settled(started.importId);
    return started.importId;
  };
  return {
    store: opened,
    fake,
    ledger,
    service,
    profileId,
    rootPath: root.path,
    rootId: root.id,
    reports,
    waits,
    start,
    consent,
    run,
    close: () => opened.close(),
  };
}
