import type { IgnoreMatcher } from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import type { BlockHasher } from './blocks.js';
import type { BlockUploader } from './block-upload.js';
import type { ConflictResult } from './conflicts.js';
import type { DriveSyncDatabase } from './db/index.js';
import type { PullProgress, PullSink } from './pull.js';
import type { PushAccepted } from './push.js';
import type { ScanSkip } from './scan.js';
import type { SyncSocket } from './socket.js';
import type { BlockSource } from './transfer.js';

export type EngineState = 'stopped' | 'running' | 'paused';

export type EngineSocket = Pick<SyncSocket, 'attach' | 'detach' | 'send' | 'report'>;

export interface EngineTimings {
  readonly changeQuietMs: number;
  readonly deleteHoldMs: number;
  readonly queueLimit: number | null;
  readonly writeQuietMs: number;
}

export interface EngineSink {
  readonly pushed: (result: PushAccepted) => void;
  readonly pulled: PullSink['pulled'];
  readonly contended: PullSink['contended'];
  readonly progress: (progress: PullProgress) => void;
  readonly blocked: PullSink['blocked'];
  readonly conflict: (result: ConflictResult) => void;
  readonly skipped: (skips: readonly ScanSkip[]) => void;
  readonly failed: (failure: { readonly relPath: string | null; readonly message: string }) => void;
}

export interface EngineOptions {
  readonly placementId: string;
  readonly driveId: string;
  readonly excluded: readonly string[];
  readonly receiveOnly: boolean;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly portablePaths: boolean;
  readonly database: DriveSyncDatabase;
  readonly socket: EngineSocket;
  readonly hasher: BlockHasher;
  readonly source: BlockSource;
  readonly uploader: BlockUploader;
  readonly ignore: IgnoreMatcher;
  readonly timings: EngineTimings;
  readonly sink: EngineSink;
  readonly log: Logger;
}
