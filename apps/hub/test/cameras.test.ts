import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CLIP_SECONDS, CameraService, UnknownStreamError } from '../src/cameras/camera-service';
import { go2rtcConfig } from '../src/cameras/go2rtc-config';
import { Go2rtcError, go2rtcClient, type Go2rtcClient } from '../src/cameras/go2rtc-client';
import type { DeviceRecord } from '../src/database/port';
import type { RecordedEvent } from '../src/state/event-router';
import type { RecordingFile, RecordingInsert } from '../src/database/port';
import { testDatabase, type TestDatabase } from './support/database';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const CAMERA_ID = '2a000000-0000-4000-8000-000000000001';

interface Request {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | null;
  readonly contentType: string | null;
  readonly body: string | null;
}

function recordingFetch(requests: Request[], reply: (url: URL) => Response): typeof fetch {
  return (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    requests.push({
      method: init?.method ?? 'GET',
      url: `${url.pathname}${url.search}`,
      authorization: headers.get('authorization'),
      contentType: headers.get('content-type'),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return Promise.resolve(reply(url));
  };
}

describe('go2rtc config', () => {
  const settings = {
    apiPort: 1984,
    rtspPort: 8554,
    webrtcPort: 8555,
    username: 'hub',
    password: 'p"w',
    candidates: ['192.168.1.2:8555'],
    iceServers: [
      { urls: ['stun:stun.example.com:3478'] },
      { urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'c' },
    ],
    xiaomi: { '1234567': 'pass"token' },
    ffmpegBinary: '/opt/service/ffmpeg',
  };

  it('binds the API and the transcoding RTSP server to loopback with local auth, disables SRTP, lists candidates and ICE servers and names the bundled ffmpeg', () => {
    expect(parse(go2rtcConfig(settings))).toStrictEqual({
      api: { listen: '127.0.0.1:1984', username: 'hub', password: 'p"w', local_auth: true },
      rtsp: { listen: '127.0.0.1:8554' },
      srtp: { listen: '' },
      webrtc: {
        listen: ':8555',
        candidates: ['192.168.1.2:8555'],
        ice_servers: [
          { urls: ['stun:stun.example.com:3478'] },
          { urls: ['turn:turn.example.com:3478'], username: 'u', credential: 'c' },
        ],
      },
      ffmpeg: { bin: '/opt/service/ffmpeg' },
      xiaomi: { '1234567': 'pass"token' },
      log: { output: 'stdout', format: 'json', level: 'info' },
    });
  });

  it('writes empty lists explicitly so go2rtc does not fall back to its own defaults', () => {
    const config: unknown = parse(
      go2rtcConfig({ ...settings, candidates: [], iceServers: [], xiaomi: {} }),
    );
    expect(config).toMatchObject({ webrtc: { candidates: [], ice_servers: [] }, xiaomi: {} });
  });

  it('is block-style YAML so go2rtc can patch the file when streams are added and removed', () => {
    const text = go2rtcConfig(settings);
    expect(text.startsWith('api:\n  listen: ')).toBe(true);
    expect(text).not.toMatch(/^[{[]/m);
  });
});

describe('go2rtc client', () => {
  const base = { baseUrl: 'http://127.0.0.1:1984', username: 'hub', password: 'secret' };
  const authorization = `Basic ${Buffer.from('hub:secret').toString('base64')}`;

  it('keeps a camera connected by preloading its stream with video and audio', async () => {
    const requests: Request[] = [];
    const client = go2rtcClient({
      ...base,
      fetch: recordingFetch(requests, () => new Response('{}')),
    });
    await client.preload(CAMERA_ID);
    await client.unpreload(CAMERA_ID);
    expect(requests).toStrictEqual([
      {
        method: 'PUT',
        url: `/api/preload?src=${CAMERA_ID}&query=video%26audio`,
        authorization,
        contentType: null,
        body: null,
      },
      {
        method: 'DELETE',
        url: `/api/preload?src=${CAMERA_ID}`,
        authorization,
        contentType: null,
        body: null,
      },
    ]);
  });

  it('treats dropping a preload that is not there as done and still fails on any other refusal', async () => {
    const absent = go2rtcClient({
      ...base,
      fetch: recordingFetch(
        [],
        () => new Response('streams: preload not found: x', { status: 500 }),
      ),
    });
    await expect(absent.unpreload(CAMERA_ID)).resolves.toBeUndefined();
    const broken = go2rtcClient({
      ...base,
      fetch: recordingFetch([], () => new Response('boom', { status: 500 })),
    });
    await expect(broken.unpreload(CAMERA_ID)).rejects.toMatchObject({
      operation: 'preload.delete',
    });
  });

  it('manages streams, exchanges SDP and fetches frames and clips with basic auth', async () => {
    const requests: Request[] = [];
    const client = go2rtcClient({
      ...base,
      fetch: recordingFetch(requests, (url) =>
        url.pathname === '/api/webrtc'
          ? new Response('v=0 answer', { status: 201 })
          : new Response(new Uint8Array([1, 2, 3])),
      ),
    });
    await client.putStream(CAMERA_ID, [
      'rtsp://10.0.0.5/1?a=b&c',
      `ffmpeg:${CAMERA_ID}#video=h264`,
    ]);
    await client.deleteStream(CAMERA_ID);
    expect(await client.answer(CAMERA_ID, 'v=0 offer')).toBe('v=0 answer');
    expect([
      ...(await client.frame(CAMERA_ID, 'full', new AbortController().signal)),
    ]).toStrictEqual([1, 2, 3]);
    expect([...(await client.clip(CAMERA_ID, 15))]).toStrictEqual([1, 2, 3]);
    expect(requests).toStrictEqual([
      {
        method: 'PUT',
        url: `/api/streams?name=${CAMERA_ID}&src=rtsp%3A%2F%2F10.0.0.5%2F1%3Fa%3Db%26c&src=ffmpeg%3A${CAMERA_ID}%23video%3Dh264`,
        authorization,
        contentType: null,
        body: null,
      },
      {
        method: 'DELETE',
        url: `/api/streams?src=${CAMERA_ID}`,
        authorization,
        contentType: null,
        body: null,
      },
      {
        method: 'POST',
        url: `/api/webrtc?src=${CAMERA_ID}`,
        authorization,
        contentType: 'application/sdp',
        body: 'v=0 offer',
      },
      {
        method: 'GET',
        url: `/api/frame.jpeg?src=${CAMERA_ID}`,
        authorization,
        contentType: null,
        body: null,
      },
      {
        method: 'GET',
        url: `/api/stream.mp4?src=${CAMERA_ID}&duration=15`,
        authorization,
        contentType: null,
        body: null,
      },
    ]);
  });

  it('addresses the MSE WebSocket of a stream with the same credentials', () => {
    expect(
      go2rtcClient({ ...base, fetch: recordingFetch([], () => new Response('')) }).socketOf(
        'cam 1',
      ),
    ).toStrictEqual({
      url: 'ws://127.0.0.1:1984/api/ws?src=cam+1',
      authorization,
    });
    expect(
      go2rtcClient({
        ...base,
        baseUrl: 'https://go2rtc.local',
        fetch: recordingFetch([], () => new Response('')),
      }).socketOf('x').url,
    ).toBe('wss://go2rtc.local/api/ws?src=x');
  });

  it('names the refused operation with the status and body', async () => {
    const client = go2rtcClient({
      ...base,
      fetch: recordingFetch([], () => new Response('stream not found\n', { status: 404 })),
    });
    await expect(client.frame('x', 'full', new AbortController().signal)).rejects.toThrow(
      'go2rtc refused frame.jpeg with HTTP 404: stream not found.',
    );
    const empty = go2rtcClient({
      ...base,
      fetch: recordingFetch([], () => new Response('', { status: 500 })),
    });
    await expect(empty.putStream('x', ['y'])).rejects.toThrow(
      new Go2rtcError('streams.put', 500, '').message,
    );
    expect(new Go2rtcError('a', 1, '').message).toBe('go2rtc refused a with HTTP 1: no body.');
  });
});

interface FakeGo2rtc extends Go2rtcClient {
  readonly calls: string[];
}

function fakeGo2rtc(failing: ReadonlySet<string> = new Set()): FakeGo2rtc {
  const calls: string[] = [];
  const act = <T>(call: string, value: T): Promise<T> => {
    calls.push(call);
    return failing.has(call.split(' ')[0] ?? '')
      ? Promise.reject(new Error(`${call} broke`))
      : Promise.resolve(value);
  };
  return {
    calls,
    putStream: (name, sources) => act(`put ${name} ${sources.join(' ')}`, undefined),
    deleteStream: (name) => act(`delete ${name}`, undefined),
    preload: (name) => act(`preload ${name}`, undefined),
    unpreload: (name) => act(`unpreload ${name}`, undefined),
    answer: (stream, offer) => act(`answer ${stream} ${offer}`, `answer-to-${offer}`),
    frame: (stream) => act(`frame ${stream}`, new Uint8Array([9])),
    consumers: () => Promise.resolve([]),
    closeConsumer: () => Promise.resolve(),
    play: () => Promise.resolve(),
    backchannel: () => Promise.resolve(true),
    clip: (stream, seconds) => act(`clip ${stream} ${String(seconds)}`, new Uint8Array([1, 2])),
    socketOf: (stream) => ({ url: `ws://go2rtc/api/ws?src=${stream}`, authorization: 'Basic x' }),
  };
}

interface Recording {
  readonly file: RecordingFile;
  readonly row: RecordingInsert;
}

interface ServiceSetup {
  db: TestDatabase;
  go2rtc: FakeGo2rtc;
  service: CameraService;
  recordings: Recording[];
  cameraId: string;
  event: RecordedEvent;
  camera: (details: DeviceRecord['details']) => DeviceRecord;
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

async function service(failing: ReadonlySet<string> = new Set()): Promise<ServiceSetup> {
  const db = await testDatabase();
  open.push(db);
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
  const device = stored;
  if (device === undefined) throw new Error('The camera device was not stored.');
  const cameraId = device.id;
  await db.database.upsertCameras([
    {
      deviceId: cameraId,
      streamName: cameraId,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
    },
  ]);
  const [eventId] = await db.database.insertEvents([
    { deviceId: cameraId, kind: 'doorbell', occurredAt: '2026-10-08T10:00:00.123Z', details: {} },
  ]);
  const go2rtc = fakeGo2rtc(failing);
  const recordings: Recording[] = [];
  return {
    db,
    go2rtc,
    recordings,
    cameraId,
    camera: (details) => ({ ...device, details }),
    event: {
      id: eventId ?? '',
      deviceId: cameraId,
      kind: 'doorbell',
      occurredAt: '2026-10-08T10:00:00.123Z',
      details: {},
    },
    service: new CameraService({
      client: go2rtc,
      conditions: { online: () => true, privacyOn: () => false, twoWayAudio: () => false },
      refusal: () => null,
      store: {
        ...db.database,
        storeRecording: (file, row): Promise<void> => {
          recordings.push({ file, row });
          return db.database.storeRecording(file, row);
        },
      },
      now: () => new Date('2026-10-08T10:00:05.000Z'),
      log: testLogger(),
    }),
  };
}

describe('CameraService', () => {
  it('adds, updates and removes go2rtc streams as camera sources change', async () => {
    const { go2rtc, service: cameras, cameraId, camera } = await service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://b' })]);
    await cameras.sync([camera({})]);
    await cameras.sync([camera({})]);
    expect(go2rtc.calls).toStrictEqual([
      `put ${cameraId} rtsp://a ffmpeg:${cameraId}#video=h264`,
      `preload ${cameraId}`,
      `put ${cameraId} rtsp://b ffmpeg:${cameraId}#video=h264`,
      `preload ${cameraId}`,
      `unpreload ${cameraId}`,
      `delete ${cameraId}`,
    ]);
  });

  it('registers every camera stream again after a go2rtc restart', async () => {
    const { go2rtc, service: cameras, cameraId, camera } = await service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.resync([camera({ go2rtcSource: 'rtsp://a' })]);
    expect(go2rtc.calls).toStrictEqual([
      `put ${cameraId} rtsp://a ffmpeg:${cameraId}#video=h264`,
      `preload ${cameraId}`,
      `put ${cameraId} rtsp://a ffmpeg:${cameraId}#video=h264`,
      `preload ${cameraId}`,
    ]);
  });

  it('answers a WebRTC offer for a known stream through go2rtc', async () => {
    const { go2rtc, service: cameras, cameraId, camera } = await service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    expect(cameras.hasStream(cameraId)).toBe(true);
    await expect(cameras.answer(cameraId, 'offer', 'client-1', 'full')).resolves.toBe(
      'answer-to-offer',
    );
    expect(go2rtc.calls).toContain(`answer ${cameraId} offer`);
    expect(logs.events()).toContain('webrtc.answered');
  });

  it('registers one stream per Xiaomi camera and serves tiles the full stream', async () => {
    const { go2rtc, service: cameras, cameraId, camera } = await service();
    const source = 'xiaomi://1:de@10.0.0.9?did=7&model=m.c.1';
    await cameras.sync([camera({ go2rtcSource: source })]);
    expect(go2rtc.calls).toStrictEqual([
      `put ${cameraId} ${source} ffmpeg:${cameraId}#video=h264`,
      `preload ${cameraId}`,
    ]);
    await cameras.answer(cameraId, 'offer', 'client-1', 'tile');
    expect(go2rtc.calls.slice(-1)).toStrictEqual([`answer ${cameraId} offer`]);
    await cameras.sync([camera({})]);
    expect(go2rtc.calls.slice(-1)).toStrictEqual([`delete ${cameraId}`]);
  });

  it('refuses an offer for an unknown stream and lets a go2rtc failure surface', async () => {
    const { service: cameras, cameraId, camera } = await service(new Set(['answer']));
    expect(cameras.hasStream('other')).toBe(false);
    await expect(cameras.answer('other', 'offer', 'client-1', 'full')).rejects.toThrow(
      'There is no camera stream named other on this hub.',
    );
    await expect(cameras.streamReady('other')).rejects.toThrow(UnknownStreamError);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await expect(cameras.answer(cameraId, 'offer', 'client-1', 'full')).rejects.toThrow(
      `answer ${cameraId} offer broke`,
    );
  });

  it('stores a snapshot and a clip for a camera event, linked to the event', async () => {
    const { go2rtc, service: cameras, cameraId, camera, event, recordings } = await service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(go2rtc.calls).toContain(`frame ${cameraId}`);
    expect(go2rtc.calls).toContain(`clip ${cameraId} ${String(CLIP_SECONDS)}`);
    expect(recordings).toHaveLength(2);
    expect(recordings).toEqual(
      expect.arrayContaining([
        {
          file: {
            path: `${cameraId}/20261008T100000123Z.jpg`,
            bytes: new Uint8Array([9]),
            contentType: 'image/jpeg',
          },
          row: {
            deviceId: cameraId,
            eventId: event.id,
            kind: 'snapshot',
            storagePath: `${cameraId}/20261008T100000123Z.jpg`,
            startedAt: '2026-10-08T10:00:05.000Z',
            durationMs: null,
            bytes: 1,
          },
        },
        {
          file: {
            path: `${cameraId}/20261008T100000123Z.mp4`,
            bytes: new Uint8Array([1, 2]),
            contentType: 'video/mp4',
          },
          row: {
            deviceId: cameraId,
            eventId: event.id,
            kind: 'clip',
            storagePath: `${cameraId}/20261008T100000123Z.mp4`,
            startedAt: '2026-10-08T10:00:05.000Z',
            durationMs: CLIP_SECONDS * 1000,
            bytes: 2,
          },
        },
      ]),
    );
  });

  it('records a clip of the asked length on demand, not linked to any event', async () => {
    const { go2rtc, service: cameras, cameraId, camera, recordings } = await service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    const path = `${cameraId}/20261008T100005000Z-manual.mp4`;
    await expect(cameras.recordClip(cameraId, 45)).resolves.toStrictEqual({
      storagePath: path,
      bytes: 2,
    });
    expect(go2rtc.calls).toContain(`clip ${cameraId} 45`);
    expect(recordings).toStrictEqual([
      {
        file: { path, bytes: new Uint8Array([1, 2]), contentType: 'video/mp4' },
        row: {
          deviceId: cameraId,
          eventId: null,
          kind: 'clip',
          storagePath: path,
          startedAt: '2026-10-08T10:00:05.000Z',
          durationMs: 45000,
          bytes: 2,
        },
      },
    ]);
  });

  it('refuses to record a camera go2rtc does not stream', async () => {
    const { service: cameras, cameraId } = await service();
    await expect(cameras.recordClip(cameraId, 10)).rejects.toThrow(
      `There is no camera stream named ${cameraId} on this hub.`,
    );
  });

  it('records nothing for other kinds, other devices, unregistered cameras or cameras with recording off', async () => {
    const { db, service: cameras, cameraId, camera, event, recordings } = await service();
    await cameras.record(event);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record({ ...event, kind: 'button' });
    await cameras.record({ ...event, deviceId: null });
    cameras.cameraChanged(db.store.cameras.change(cameraId, { record_events: false }));
    await cameras.record(event);
    expect(recordings).toStrictEqual([]);
    cameras.cameraChanged(db.store.cameras.change(cameraId, { record_events: true }));
    await cameras.record(event);
    expect(recordings).toHaveLength(2);
  });

  it('loads the recording setting of each camera', async () => {
    const { db, service: cameras, cameraId, camera, event, recordings } = await service();
    db.store.cameras.change(cameraId, { record_events: false });
    await cameras.load();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(recordings).toStrictEqual([]);
  });

  it('reports a capture that failed and still stores the other one', async () => {
    const { service: cameras, camera, event, recordings } = await service(new Set(['frame']));
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(recordings.map((entry) => entry.row.kind)).toStrictEqual(['clip']);
    expect(logs.events()).toContain('recording.failed');
  });
});
