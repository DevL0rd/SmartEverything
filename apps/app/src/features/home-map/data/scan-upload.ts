import { useSyncExternalStore } from 'react';
import {
  ApiError,
  HOME_MAP_SCAN_FORMATS,
  type HomeMapScanFormat,
  type HomeMapScanStored,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { decimal } from '../../../format/number';
import type { PickedBlob } from '../../../platform/pick-files';

const log = new Logger('app.home-map');

export type ScanUploadProblem = 'unreadable' | 'no-space' | 'stopped';

export type ScanUploadState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'uploading';
      readonly name: string;
      readonly sentBytes: number;
      readonly totalBytes: number;
    }
  | {
      readonly kind: 'failed';
      readonly name: string;
      readonly problem: ScanUploadProblem;
      readonly detail: string | null;
    };

export interface ScanUploadRequest {
  readonly mapId: string;
  readonly format: HomeMapScanFormat;
  readonly file: PickedBlob;
  readonly signal: AbortSignal;
  readonly onProgress: (sentBytes: number, totalBytes: number) => void;
}

export type ScanTransport = (request: ScanUploadRequest) => Promise<HomeMapScanStored>;

export type ScanStored = (mapId: string, stored: HomeMapScanStored) => void;

export const SCAN_UPLOAD_IDLE: ScanUploadState = { kind: 'idle' };

export const SCAN_UPLOAD_PROBLEM_TEXT: Readonly<Record<ScanUploadProblem, string>> = {
  unreadable: 'This file isn’t a splat we can read',
  'no-space': 'Not enough space on the hub',
  stopped: 'Upload stopped · Try again',
};

export const SCAN_CHIP_FORMATS = [
  'ply',
  'splat',
  'spz',
] as const satisfies readonly HomeMapScanFormat[];

function isScanFormat(value: string): value is HomeMapScanFormat {
  return HOME_MAP_SCAN_FORMATS.some((format) => format === value);
}

export function scanFormatOf(name: string): HomeMapScanFormat | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  const extension = name.slice(dot + 1).toLowerCase();
  return isScanFormat(extension) ? extension : null;
}

export function scanUploadProblemOf(error: unknown): ScanUploadProblem {
  if (!(error instanceof ApiError)) return 'stopped';
  if (error.code === 'payload_too_large' && error.reason === 'insufficient_storage') {
    return 'no-space';
  }
  if (error.code === 'invalid_request' || error.code === 'unsupported_media_type') {
    return 'unreadable';
  }
  return 'stopped';
}

export function scanUploadDetailOf(error: unknown): string | null {
  return error instanceof ApiError && error.message !== '' ? error.message : null;
}

const UNITS = [
  { name: 'KB', size: 1024 },
  { name: 'MB', size: 1024 ** 2 },
  { name: 'GB', size: 1024 ** 3 },
] as const;

function unitOf(totalBytes: number): (typeof UNITS)[number] {
  return [...UNITS].reverse().find((unit) => totalBytes >= unit.size) ?? UNITS[0];
}

export function uploadShare(sentBytes: number, totalBytes: number): number {
  return totalBytes > 0 ? Math.min(1, Math.max(0, sentBytes / totalBytes)) : 0;
}

export function uploadLine(sentBytes: number, totalBytes: number): string {
  const unit = unitOf(totalBytes);
  const percent = Math.round(uploadShare(sentBytes, totalBytes) * 100);
  const sent = decimal(Math.round(sentBytes / unit.size));
  const total = decimal(Math.round(totalBytes / unit.size));
  return `${String(percent)}% · ${sent} of ${total} ${unit.name} · you can keep using the app`;
}

interface Attempt {
  readonly file: PickedBlob;
  readonly controller: AbortController;
}

export class ScanUploads {
  private readonly states = new Map<string, ScanUploadState>();
  private readonly attempts = new Map<string, Attempt>();
  private readonly files = new Map<string, PickedBlob>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly transport: ScanTransport,
    private readonly onStored: ScanStored,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  stateOf(mapId: string): ScanUploadState {
    return this.states.get(mapId) ?? SCAN_UPLOAD_IDLE;
  }

  start(mapId: string, file: PickedBlob): void {
    this.attempts.get(mapId)?.controller.abort();
    this.files.set(mapId, file);
    const format = scanFormatOf(file.name);
    if (format === null) {
      this.attempts.delete(mapId);
      this.put(mapId, { kind: 'failed', name: file.name, problem: 'unreadable', detail: null });
      return;
    }
    const attempt: Attempt = { file, controller: new AbortController() };
    this.attempts.set(mapId, attempt);
    this.put(mapId, { kind: 'uploading', name: file.name, sentBytes: 0, totalBytes: file.bytes });
    background(this.run(mapId, format, attempt), 'home_map.scan_upload_crashed');
  }

  retry(mapId: string): void {
    const file = this.files.get(mapId);
    if (file !== undefined) this.start(mapId, file);
  }

  cancel(mapId: string): void {
    const attempt = this.attempts.get(mapId);
    this.attempts.delete(mapId);
    attempt?.controller.abort();
    this.clear(mapId);
  }

  dismiss(mapId: string): void {
    if (this.stateOf(mapId).kind === 'failed') this.clear(mapId);
  }

  private clear(mapId: string): void {
    this.files.delete(mapId);
    this.put(mapId, SCAN_UPLOAD_IDLE);
  }

  private async run(mapId: string, format: HomeMapScanFormat, attempt: Attempt): Promise<void> {
    const current = (): boolean => this.attempts.get(mapId) === attempt;
    try {
      const stored = await this.transport({
        mapId,
        format,
        file: attempt.file,
        signal: attempt.controller.signal,
        onProgress: (sentBytes, totalBytes) => {
          if (current()) {
            this.put(mapId, { kind: 'uploading', name: attempt.file.name, sentBytes, totalBytes });
          }
        },
      });
      if (!current()) return;
      this.attempts.delete(mapId);
      this.clear(mapId);
      this.onStored(mapId, stored);
    } catch (error) {
      if (!current()) return;
      this.attempts.delete(mapId);
      const problem = scanUploadProblemOf(error);
      log.warn('home_map.scan_upload_failed', { problem, error });
      this.put(mapId, {
        kind: 'failed',
        name: attempt.file.name,
        problem,
        detail: scanUploadDetailOf(error),
      });
    }
  }

  private put(mapId: string, state: ScanUploadState): void {
    if (state.kind === 'idle') this.states.delete(mapId);
    else this.states.set(mapId, state);
    for (const listener of this.listeners) listener();
  }
}

export function useScanUpload(uploads: ScanUploads, mapId: string): ScanUploadState {
  const read = (): ScanUploadState => uploads.stateOf(mapId);
  return useSyncExternalStore(uploads.subscribe, read, read);
}
