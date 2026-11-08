import { ApiError, type HomeMapScanStored } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import {
  SCAN_UPLOAD_PROBLEM_TEXT,
  ScanUploads,
  scanFormatOf,
  scanUploadProblemOf,
  uploadLine,
  type ScanUploadRequest,
} from './scan-upload';

const MB = 1024 ** 2;

function fileOf(name: string, bytes = 288 * MB): PickedBlob {
  return {
    name,
    mime: 'application/octet-stream',
    bytes,
    preview: null,
    data: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob([])),
  };
}

const STORED: HomeMapScanStored = {
  revision: 4,
  scan: {
    opacity: 0.8,
    residualM: null,
    uploadedAt: '2026-10-25T10:00:00.000Z',
    uploadedBy: 'person-1',
    file: { hash: 'a'.repeat(64), format: 'spz', bytes: 288 * MB, name: 'home-scan.spz' },
    lod: null,
    transform: { tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, levelled: false },
    points: [],
  },
};

interface Pending {
  readonly request: ScanUploadRequest;
  readonly resolve: (stored: HomeMapScanStored) => void;
  readonly reject: (error: unknown) => void;
}

function fakeTransport(): {
  readonly sent: Pending[];
  readonly transport: (request: ScanUploadRequest) => Promise<HomeMapScanStored>;
} {
  const sent: Pending[] = [];
  return {
    sent,
    transport: (request) =>
      new Promise((resolve, reject) => {
        sent.push({ request, resolve, reject });
      }),
  };
}

function setup(): {
  readonly uploads: ScanUploads;
  readonly sent: Pending[];
  readonly stored: ReturnType<typeof vi.fn>;
} {
  const fake = fakeTransport();
  const stored = vi.fn();
  return { uploads: new ScanUploads(fake.transport, stored), sent: fake.sent, stored };
}

function only(sent: readonly Pending[]): Pending {
  const [first] = sent;
  if (first === undefined) throw new Error('nothing was sent');
  return first;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('scanFormatOf', () => {
  it('reads every accepted format from the file name, any case', () => {
    expect(scanFormatOf('home-scan.SPZ')).toBe('spz');
    expect(scanFormatOf('a.b.ply')).toBe('ply');
    expect(scanFormatOf('room.splat')).toBe('splat');
    expect(scanFormatOf('room.rad')).toBe('rad');
    expect(scanFormatOf('photo.jpg')).toBeNull();
    expect(scanFormatOf('noextension')).toBeNull();
  });
});

describe('scanUploadProblemOf', () => {
  it('maps hub refusals to the three upload errors', () => {
    const noSpace = new ApiError('payload_too_large', 'Not enough space', 'insufficient_storage');
    expect(scanUploadProblemOf(noSpace)).toBe('no-space');
    expect(scanUploadProblemOf(new ApiError('invalid_request', 'refused'))).toBe('unreadable');
    expect(scanUploadProblemOf(new ApiError('unsupported_media_type', 'no'))).toBe('unreadable');
    expect(scanUploadProblemOf(new ApiError('internal', 'broke'))).toBe('stopped');
    expect(scanUploadProblemOf(new TypeError('Network request failed'))).toBe('stopped');
  });
});

describe('uploadLine', () => {
  it('reads like the design copy', () => {
    expect(uploadLine(184 * MB, 288 * MB)).toBe('64% · 184 of 288 MB · you can keep using the app');
    expect(uploadLine(0, 0)).toBe('0% · 0 of 0 KB · you can keep using the app');
  });
});

describe('ScanUploads', () => {
  it('sends the file with its format, tracks progress and clears on success', async () => {
    const { uploads, sent, stored } = setup();
    uploads.start('map-1', fileOf('home-scan.spz'));
    const pending = only(sent);
    expect(pending.request).toMatchObject({ mapId: 'map-1', format: 'spz' });
    expect(uploads.stateOf('map-1')).toEqual({
      kind: 'uploading',
      name: 'home-scan.spz',
      sentBytes: 0,
      totalBytes: 288 * MB,
    });
    pending.request.onProgress(184 * MB, 288 * MB);
    expect(uploads.stateOf('map-1')).toMatchObject({ sentBytes: 184 * MB });
    pending.resolve(STORED);
    await settle();
    expect(uploads.stateOf('map-1')).toEqual({ kind: 'idle' });
    expect(stored).toHaveBeenCalledWith('map-1', STORED);
  });

  it('refuses a file that is not a splat without sending it', () => {
    const { uploads, sent } = setup();
    uploads.start('map-1', fileOf('holiday.jpg'));
    expect(sent).toHaveLength(0);
    expect(uploads.stateOf('map-1')).toEqual({
      kind: 'failed',
      name: 'holiday.jpg',
      problem: 'unreadable',
      detail: null,
    });
  });

  it('shows the hub errors in the card and never resends by itself', async () => {
    const { uploads, sent } = setup();
    uploads.start('map-1', fileOf('home-scan.spz'));
    only(sent).reject(new ApiError('payload_too_large', 'full', 'insufficient_storage'));
    await settle();
    expect(uploads.stateOf('map-1')).toMatchObject({
      kind: 'failed',
      problem: 'no-space',
      detail: 'full',
    });
    expect(SCAN_UPLOAD_PROBLEM_TEXT['no-space']).toBe('Not enough space on the hub');
    await settle();
    expect(sent).toHaveLength(1);
  });

  it('a stopped upload is sent again only when the user retries', async () => {
    const { uploads, sent, stored } = setup();
    uploads.start('map-1', fileOf('home-scan.spz'));
    only(sent).reject(new TypeError('Network request failed'));
    await settle();
    expect(uploads.stateOf('map-1')).toMatchObject({
      kind: 'failed',
      problem: 'stopped',
      detail: null,
    });
    expect(sent).toHaveLength(1);
    uploads.retry('map-1');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.request.file.name).toBe('home-scan.spz');
    sent[1]?.resolve(STORED);
    await settle();
    expect(stored).toHaveBeenCalledTimes(1);
  });

  it('cancel aborts the transfer, clears the card and ignores the late answer', async () => {
    const { uploads, sent, stored } = setup();
    uploads.start('map-1', fileOf('home-scan.spz'));
    const pending = only(sent);
    uploads.cancel('map-1');
    expect(pending.request.signal.aborted).toBe(true);
    expect(uploads.stateOf('map-1')).toEqual({ kind: 'idle' });
    pending.request.onProgress(10, 20);
    pending.reject(new DOMException('aborted', 'AbortError'));
    await settle();
    expect(uploads.stateOf('map-1')).toEqual({ kind: 'idle' });
    uploads.retry('map-1');
    expect(sent).toHaveLength(1);
    expect(stored).not.toHaveBeenCalled();
  });

  it('a new file replaces a running upload and the old answer is ignored', async () => {
    const { uploads, sent, stored } = setup();
    uploads.start('map-1', fileOf('first.ply'));
    uploads.start('map-1', fileOf('second.spz'));
    expect(sent[0]?.request.signal.aborted).toBe(true);
    sent[0]?.resolve(STORED);
    await settle();
    expect(uploads.stateOf('map-1')).toMatchObject({ kind: 'uploading', name: 'second.spz' });
    expect(stored).not.toHaveBeenCalled();
  });

  it('keeps each map apart, notifies listeners and dismisses only errors', async () => {
    const { uploads, sent } = setup();
    const listener = vi.fn();
    const off = uploads.subscribe(listener);
    uploads.start('map-1', fileOf('a.spz'));
    uploads.start('map-2', fileOf('b.spz'));
    expect(listener).toHaveBeenCalledTimes(2);
    uploads.dismiss('map-1');
    expect(uploads.stateOf('map-1').kind).toBe('uploading');
    sent[1]?.reject(new ApiError('invalid_request', 'refused'));
    await settle();
    expect(uploads.stateOf('map-1').kind).toBe('uploading');
    uploads.dismiss('map-2');
    expect(uploads.stateOf('map-2')).toEqual({ kind: 'idle' });
    off();
    uploads.cancel('map-1');
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
