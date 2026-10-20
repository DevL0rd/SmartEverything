import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraHealth, reconnectingProbe, type CameraDown } from '../src/cameras/camera-health';
import { CameraOfflineError, CameraService } from '../src/cameras/camera-service';
import { FrameTimeoutError } from '../src/cameras/frame-cache';
import { go2rtcClient } from '../src/cameras/go2rtc-client';
import type { DeviceRecord } from '../src/database/port';
import { CameraLoad, observedGo2rtc } from '../src/firewall/observed-go2rtc';
import { testDatabase, type TestDatabase } from './support/database';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const SECOND = 1000;
const FRAME_DEADLINE_MS = 10 * SECOND;
const PROBE_MS = 60 * SECOND;

interface DeadCamera {
  readonly service: CameraService;
  readonly requests: string[];
  readonly changes: (readonly [string, CameraDown | null])[];
  readonly cameraId: string;
  readonly plugIn: () => void;
  readonly health: CameraHealth;
}

let logs: CapturedLogs;
let db: TestDatabase;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(async () => {
  vi.useRealTimers();
  await db.close();
});

class Go2rtcState {
  alive = false;

  constructor(private readonly healsOnDelete: boolean) {}

  dropStream(): void {
    this.alive = this.alive || this.healsOnDelete;
  }
}

function stuck(url: URL, signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (url.pathname === '/api/webrtc') {
      setTimeout(() => {
        resolve(new Response('streams: read udp [::]:41630: i/o timeout', { status: 500 }));
      }, 15 * SECOND);
    }
    signal?.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });
}

function management(url: URL, method: string, state: Go2rtcState): Response | null {
  if (url.pathname === '/api/streams' && method === 'DELETE') {
    state.dropStream();
    return new Response(null);
  }
  if (url.pathname === '/api/streams' && method === 'GET') {
    return Response.json({ consumers: [] });
  }
  return url.pathname === '/api/streams' || url.pathname === '/api/preload'
    ? new Response(null)
    : null;
}

function fakeGo2rtc(requests: string[], state: Go2rtcState): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);
    const handled = management(url, method, state);
    if (handled !== null) {
      return Promise.resolve(handled);
    }
    if (!state.alive) {
      return stuck(url, init?.signal);
    }
    return Promise.resolve(
      url.pathname === '/api/webrtc'
        ? new Response('answer', { status: 201 })
        : new Response(new Uint8Array([1, 2, 3])),
    );
  };
}

async function deadCamera(healsOnDelete = false): Promise<DeadCamera> {
  db = await testDatabase();
  const [stored] = await db.database.upsertDevices([
    {
      provider: 'xiaomi',
      externalId: 'cam',
      parentId: null,
      kind: 'camera',
      name: 'Cam',
      model: 'cam',
      manufacturer: 'cam',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (stored === undefined) throw new Error('The camera device was not stored.');
  const device: DeviceRecord = { ...stored, details: { go2rtcSource: 'rtsp://10.0.0.9/1' } };
  vi.useFakeTimers({ now: new Date('2026-10-18T12:00:00.000Z') });
  const requests: string[] = [];
  const state = new Go2rtcState(healsOnDelete);
  const raw = go2rtcClient({
    baseUrl: 'http://127.0.0.1:1984',
    username: 'hub',
    password: 'secret',
    fetch: fakeGo2rtc(requests, state),
  });
  const load = new CameraLoad();
  const health = new CameraHealth({
    load: (deviceId): Readonly<Record<string, number>> => load.of(deviceId),
    faultOf: (): 'camera' => 'camera',
    probe: reconnectingProbe(raw, () => 'rtsp://10.0.0.9/1'),
    now: (): Date => new Date(),
    log: testLogger('cameras'),
  });
  const changes: (readonly [string, CameraDown | null])[] = [];
  health.onChange((deviceId, down) => {
    changes.push([deviceId, down]);
  });
  const client = observedGo2rtc(raw, {
    load,
    refusal: (deviceId): CameraOfflineError | null => health.refusal(deviceId),
    failed: (deviceId): void => {
      health.failed(deviceId);
    },
    recovered: (deviceId): void => {
      health.recovered(deviceId);
    },
    blockingAddress: (): null => null,
  });
  const service = new CameraService({
    client,
    conditions: {
      online: (): boolean => true,
      privacyOn: (): boolean => false,
      twoWayAudio: (): boolean => false,
    },
    refusal: (deviceId): CameraOfflineError | null => health.refusal(deviceId),
    store: db.database,
    now: (): Date => new Date(),
    log: testLogger('cameras'),
  });
  await service.sync([device]);
  requests.length = 0;
  return {
    service,
    requests,
    changes,
    cameraId: stored.id,
    health,
    plugIn: (): void => {
      state.alive = true;
    },
  };
}

describe('a camera that stopped answering', () => {
  it('times out once, then refuses snapshots, offers and clips at once without asking go2rtc', async () => {
    const { service, requests, changes, cameraId, health } = await deadCamera();
    const first = service.snapshot(cameraId, 'full');
    const outcome = expect(first).rejects.toBeInstanceOf(FrameTimeoutError);
    await vi.advanceTimersByTimeAsync(FRAME_DEADLINE_MS);
    await outcome;
    expect(changes.map(([, down]) => down?.fault)).toStrictEqual(['camera']);
    expect(logs.records.find((record) => record.event === 'camera.down')?.payload).toMatchObject({
      requestsInFlight: { frame: 1 },
    });
    requests.length = 0;
    await expect(service.snapshot(cameraId, 'thumb')).rejects.toBeInstanceOf(CameraOfflineError);
    await expect(service.answer(cameraId, 'offer', 'client', 'tile')).rejects.toBeInstanceOf(
      CameraOfflineError,
    );
    await expect(service.recordClip(cameraId, 5)).rejects.toBeInstanceOf(CameraOfflineError);
    expect(requests).toStrictEqual([]);
    health.stop();
  });

  it('is marked down by a WebRTC offer that fails on a UDP timeout and answers the next offers at once', async () => {
    const { service, requests, changes, cameraId, health } = await deadCamera();
    const first = service.answer(cameraId, 'offer', 'client', 'full');
    const outcome = expect(first).rejects.toMatchObject({ operation: 'webrtc.offer' });
    await vi.advanceTimersByTimeAsync(15 * SECOND);
    await outcome;
    expect(changes).toHaveLength(1);
    requests.length = 0;
    await expect(service.answer(cameraId, 'offer', 'client', 'full')).rejects.toBeInstanceOf(
      CameraOfflineError,
    );
    expect(requests).toStrictEqual([]);
    health.stop();
  });

  it('does not record or fail loudly for events while the camera is down', async () => {
    const { service, requests, cameraId, health } = await deadCamera();
    const first = service.snapshot(cameraId, 'full');
    const outcome = expect(first).rejects.toBeInstanceOf(FrameTimeoutError);
    await vi.advanceTimersByTimeAsync(FRAME_DEADLINE_MS);
    await outcome;
    requests.length = 0;
    await service.record({
      id: 'event-1',
      deviceId: cameraId,
      kind: 'motion',
      occurredAt: '2026-10-18T12:00:11.000Z',
      details: {},
    });
    expect(requests).toStrictEqual([]);
    expect(logs.events()).toContain('recording.skipped');
    expect(logs.events()).not.toContain('recording.failed');
    expect(logs.records.filter((record) => record.level === 'error')).toStrictEqual([]);
    health.stop();
  });

  it('serves again, with one recovery announced, once a probe sees a picture', async () => {
    const { service, changes, cameraId, plugIn } = await deadCamera();
    const first = service.snapshot(cameraId, 'full');
    const outcome = expect(first).rejects.toBeInstanceOf(FrameTimeoutError);
    await vi.advanceTimersByTimeAsync(FRAME_DEADLINE_MS);
    await outcome;
    plugIn();
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(changes.map(([, down]) => down?.fault ?? null)).toStrictEqual(['camera', null]);
    await expect(service.snapshot(cameraId, 'full')).resolves.toHaveLength(3);
  });

  it('recovers a camera whose go2rtc stream stays wedged until the stream is dropped and added again', async () => {
    const { service, changes, requests, cameraId } = await deadCamera(true);
    const first = service.snapshot(cameraId, 'full');
    const outcome = expect(first).rejects.toBeInstanceOf(FrameTimeoutError);
    await vi.advanceTimersByTimeAsync(FRAME_DEADLINE_MS);
    await outcome;
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(PROBE_MS);
    expect(requests.slice(0, 5)).toStrictEqual([
      'DELETE /api/preload',
      'DELETE /api/streams',
      'PUT /api/streams',
      'PUT /api/preload',
      'GET /api/frame.jpeg',
    ]);
    expect(changes.map(([, down]) => down?.fault ?? null)).toStrictEqual(['camera', null]);
    await expect(service.snapshot(cameraId, 'full')).resolves.toHaveLength(3);
  });
});
