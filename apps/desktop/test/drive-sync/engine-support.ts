import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blockSizeFor } from '@smarteverything/domain/drive-sync';
import { Logger } from '@smarteverything/logging';
import { HubBlockUploader } from '../../src/drive-sync/block-upload.js';
import {
  FileChangedWhileHashingError,
  type BlockHasher,
  type HashedFile,
} from '../../src/drive-sync/blocks.js';
import { openDriveSyncDatabase, type DriveSyncDatabase } from '../../src/drive-sync/db/index.js';
import { DriveSyncEngine, type EngineSink } from '../../src/drive-sync/engine.js';
import type { ConflictResult } from '../../src/drive-sync/conflicts.js';
import { isEngineTempName } from '../../src/drive-sync/scan.js';
import { ignoreMatcherOf } from '../../src/drive-sync/state.js';
import { SyncSocket, type SyncSocketSink } from '../../src/drive-sync/socket.js';
import { RemoteChangedError, type BlockSource } from '../../src/drive-sync/transfer.js';
import { blockHashes } from './pull-support.js';
import {
  startFakeHub,
  TestTransport,
  until,
  type FakeHub,
  type PeerPlacement,
} from './hub-harness.js';

const log = new Logger('desktop.drive-sync');

export const CONVERGE_MS = 20_000;

export interface Peer {
  readonly name: string;
  readonly placementId: string;
  readonly engine: DriveSyncEngine;
  readonly database: DriveSyncDatabase;
  readonly localPath: string;
  readonly socket: SyncSocket;
  readonly conflicts: ConflictResult[];
  readonly failures: string[];
}

export interface Lab {
  readonly hub: FakeHub;
  readonly transport: TestTransport;
  readonly peer: (name: string, placement?: PeerPlacement) => Promise<Peer>;
  readonly close: () => Promise<void>;
}

function hasherOf(): BlockHasher {
  return {
    hash: async (path, bytes): Promise<HashedFile> => {
      const content = await readFile(path);
      if (content.length !== bytes) {
        throw new FileChangedWhileHashingError(path, bytes, content.length);
      }
      const size = blockSizeFor(bytes);
      const hashes: string[] = [];
      for (let at = 0; at < content.length; at += size) {
        hashes.push(
          createHash('sha256')
            .update(content.subarray(at, at + size))
            .digest('hex'),
        );
      }
      return { blockSize: size, hashes };
    },
    close: (): Promise<void> => Promise.resolve(),
  };
}

function sourceOf(hub: FakeHub): BlockSource {
  const contentOf = async (itemId: string): Promise<Buffer> => {
    const item = hub.store.driveItems.find(itemId, hub.ownerId);
    if (item === undefined) throw new RemoteChangedError(itemId);
    return hub.readFile(item.relPath);
  };
  return {
    hashes: async (file) => blockHashes(await contentOf(file.itemId)),
    block: async (file, index) =>
      (await contentOf(file.itemId)).subarray(index * file.blockSize, (index + 1) * file.blockSize),
  };
}

interface Context {
  readonly hub: FakeHub;
  readonly transport: TestTransport;
  readonly scratch: string;
}

function engineSink(conflicts: ConflictResult[], failures: string[]): EngineSink {
  return {
    pushed: (): void => undefined,
    pulled: (): void => undefined,
    contended: (): void => undefined,
    progress: (): void => undefined,
    blocked: (result): void => {
      failures.push(`blocked ${result.relPath}`);
    },
    conflict: (result): void => {
      conflicts.push(result);
    },
    skipped: (): void => undefined,
    failed: (failure): void => {
      failures.push(failure.message);
    },
  };
}

function forwardTo(target: () => SyncSocketSink): SyncSocketSink {
  return {
    opened: (placementId): void => {
      target().opened(placementId);
    },
    message: (placementId, message): void => {
      target().message(placementId, message);
    },
    closed: (placementId, closure): void => {
      target().closed(placementId, closure);
    },
  };
}

async function peerOf(context: Context, name: string, placement: PeerPlacement): Promise<Peer> {
  const { hub, transport, scratch } = context;
  const identity = hub.peer(name, placement);
  const localPath = join(scratch, name);
  await mkdir(localPath, { recursive: true });
  const database = openDriveSyncDatabase(join(scratch, `${name}.sqlite`), log);
  const conflicts: ConflictResult[] = [];
  const failures: string[] = [];
  const socket: SyncSocket = new SyncSocket({
    hubUrl: hub.url,
    token: identity.token,
    transport,
    log,
    sink: forwardTo(() => engine.sink),
  });
  const engine: DriveSyncEngine = new DriveSyncEngine({
    placementId: identity.placementId,
    driveId: hub.driveId,
    excluded: placement.excluded ?? [],
    receiveOnly: placement.readOnly === true,
    rootPath: localPath,
    platform: process.platform,
    portablePaths: false,
    database,
    socket,
    hasher: hasherOf(),
    source: sourceOf(hub),
    uploader: new HubBlockUploader({ hubUrl: hub.url, token: identity.token, fetch }),
    ignore: ignoreMatcherOf(placement.ignorePatterns ?? [], process.platform),
    timings: { changeQuietMs: 30, deleteHoldMs: 120, queueLimit: null, writeQuietMs: 0 },
    sink: engineSink(conflicts, failures),
    log,
  });
  return {
    name,
    placementId: identity.placementId,
    engine,
    database,
    localPath,
    socket,
    conflicts,
    failures,
  };
}

export async function openLab(): Promise<Lab> {
  const hub = await startFakeHub();
  const scratch = await mkdtemp(join(tmpdir(), 'drive-sync-engine-'));
  const transport = new TestTransport();
  const peers: Peer[] = [];
  return {
    hub,
    transport,
    peer: async (name, placement = {}): Promise<Peer> => {
      const peer = await peerOf({ hub, transport, scratch }, name, placement);
      peers.push(peer);
      return peer;
    },
    close: async (): Promise<void> => {
      for (const peer of peers) {
        await peer.engine.stop();
        peer.socket.stop();
      }
      transport.closeAll();
      for (const peer of peers) peer.database.close();
      await hub.stop();
      await rm(scratch, { recursive: true, force: true });
    },
  };
}

export async function snapshot(directory: string): Promise<Record<string, string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const found: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile() || isEngineTempName(entry.name)) continue;
    const path = join(entry.parentPath, entry.name);
    try {
      found[path.slice(directory.length + 1)] = (await readFile(path)).toString();
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    }
  }
  return found;
}

export function sameFiles(first: Record<string, string>, second: Record<string, string>): boolean {
  const left = Object.entries(first).sort(([a], [b]) => a.localeCompare(b));
  const right = Object.entries(second).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function sees(peer: Peer, files: Record<string, string>): Promise<void> {
  await until(
    async () => sameFiles(await snapshot(peer.localPath), files),
    `${peer.name} to hold ${Object.keys(files).join(', ')}`,
    CONVERGE_MS,
  );
}
