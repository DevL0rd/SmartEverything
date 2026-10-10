import { beforeEach, describe, expect, it } from 'vitest';
import type { CameraRow } from '@smarteverything/domain';
import { CLIP_SECONDS, CameraService, UnknownStreamError } from '../src/cameras/camera-service';
import { go2rtcConfig } from '../src/cameras/go2rtc-config';
import { Go2rtcError, go2rtcClient, type Go2rtcClient } from '../src/cameras/go2rtc-client';
import type { DeviceRecord } from '../src/database/port';
import { FakeDatabase } from './support/fake-database';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const CAMERA_ID = '2a000000-0000-4000-8000-000000000001';
const EVENT_ID = '2b000000-0000-4000-8000-000000000001';

function camera(details: DeviceRecord['details']): DeviceRecord {
  return {
    id: CAMERA_ID,
    provider: 'xiaomi',
    externalId: 'cam',
    parentId: null,
    kind: 'camera',
    online: true,
    roomId: null,
    capabilities: [],
    details,
  };
}

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
  it('binds the API and the transcoding RTSP server to loopback with local auth, disables SRTP and lists candidates and ICE servers', () => {
    expect(
      go2rtcConfig({
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
      }),
    ).toBe(
      [
        'api:',
        '  listen: "127.0.0.1:1984"',
        '  username: "hub"',
        '  password: "p\\"w"',
        '  local_auth: true',
        'rtsp:',
        '  listen: "127.0.0.1:8554"',
        'srtp:',
        '  listen: ""',
        'webrtc:',
        '  listen: ":8555"',
        '  candidates:',
        '    - "192.168.1.2:8555"',
        '  ice_servers:',
        '    - urls:',
        '        - "stun:stun.example.com:3478"',
        '    - urls:',
        '        - "turn:turn.example.com:3478"',
        '      username: "u"',
        '      credential: "c"',
        'xiaomi:',
        '  1234567: "pass\\"token"',
        'log:',
        '  output: "stdout"',
        '  format: "json"',
        '  level: "info"',
        '',
      ].join('\n'),
    );
  });

  it('writes empty lists explicitly so go2rtc does not fall back to its own defaults', () => {
    const config = go2rtcConfig({
      apiPort: 1,
      rtspPort: 3,
      webrtcPort: 2,
      username: 'a',
      password: 'b',
      candidates: [],
      iceServers: [],
      xiaomi: {},
    });
    expect(config).toContain('  candidates: []\n  ice_servers: []\n');
    expect(config).toContain('\nxiaomi: {}\n');
  });
});

describe('go2rtc client', () => {
  const base = { baseUrl: 'http://127.0.0.1:1984', username: 'hub', password: 'secret' };
  const authorization = `Basic ${Buffer.from('hub:secret').toString('base64')}`;

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
    expect([...(await client.frame(CAMERA_ID))]).toStrictEqual([1, 2, 3]);
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
    await expect(client.frame('x')).rejects.toThrow(
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
    answer: (stream, offer) => act(`answer ${stream} ${offer}`, `answer-to-${offer}`),
    frame: (stream) => act(`frame ${stream}`, new Uint8Array([9])),
    clip: (stream, seconds) => act(`clip ${stream} ${String(seconds)}`, new Uint8Array([1, 2])),
    socketOf: (stream) => ({ url: `ws://go2rtc/api/ws?src=${stream}`, authorization: 'Basic x' }),
  };
}

interface ServiceSetup {
  db: FakeDatabase;
  go2rtc: FakeGo2rtc;
  service: CameraService;
}

function service(failing: ReadonlySet<string> = new Set()): ServiceSetup {
  const db = new FakeDatabase();
  const go2rtc = fakeGo2rtc(failing);
  return {
    db,
    go2rtc,
    service: new CameraService({
      client: go2rtc,
      store: db,
      now: () => new Date('2026-10-08T10:00:05.000Z'),
      log: testLogger(),
    }),
  };
}

const event = {
  id: EVENT_ID,
  deviceId: CAMERA_ID,
  kind: 'doorbell',
  occurredAt: '2026-10-08T10:00:00.123Z',
  details: {},
} as const;

function cameraRow(recordEvents: boolean): CameraRow {
  return {
    device_id: CAMERA_ID,
    stream_name: CAMERA_ID,
    source_url_kind: 'rtsp',
    physical_ptz: false,
    two_way_audio: false,
    record_events: recordEvents,
  };
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

describe('CameraService', () => {
  it('adds, updates and removes go2rtc streams as camera sources change', async () => {
    const { go2rtc, service: cameras } = service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://b' })]);
    await cameras.sync([camera({})]);
    await cameras.sync([camera({})]);
    expect(go2rtc.calls).toStrictEqual([
      `put ${CAMERA_ID} rtsp://a ffmpeg:${CAMERA_ID}#video=h264`,
      `put ${CAMERA_ID} rtsp://b ffmpeg:${CAMERA_ID}#video=h264`,
      `delete ${CAMERA_ID}`,
    ]);
  });

  it('registers every camera stream again after a go2rtc restart', async () => {
    const { go2rtc, service: cameras } = service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.resync([camera({ go2rtcSource: 'rtsp://a' })]);
    expect(go2rtc.calls).toStrictEqual([
      `put ${CAMERA_ID} rtsp://a ffmpeg:${CAMERA_ID}#video=h264`,
      `put ${CAMERA_ID} rtsp://a ffmpeg:${CAMERA_ID}#video=h264`,
    ]);
  });

  it('answers a WebRTC offer for a known stream through go2rtc', async () => {
    const { go2rtc, service: cameras } = service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    expect(cameras.hasStream(CAMERA_ID)).toBe(true);
    await expect(cameras.answer(CAMERA_ID, 'offer')).resolves.toBe('answer-to-offer');
    expect(go2rtc.calls).toContain(`answer ${CAMERA_ID} offer`);
    expect(logs.events()).toContain('webrtc.answered');
  });

  it('refuses an offer for an unknown stream and lets a go2rtc failure surface', async () => {
    const { service: cameras } = service(new Set(['answer']));
    expect(cameras.hasStream('other')).toBe(false);
    await expect(cameras.answer('other', 'offer')).rejects.toThrow(
      'There is no camera stream named other on this hub.',
    );
    await expect(cameras.streamReady('other')).rejects.toThrow(UnknownStreamError);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await expect(cameras.answer(CAMERA_ID, 'offer')).rejects.toThrow(
      `answer ${CAMERA_ID} offer broke`,
    );
  });

  it('stores a snapshot and a clip for a camera event, linked to the event', async () => {
    const { db, go2rtc, service: cameras } = service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(go2rtc.calls).toContain(`frame ${CAMERA_ID}`);
    expect(go2rtc.calls).toContain(`clip ${CAMERA_ID} ${String(CLIP_SECONDS)}`);
    expect(db.recordings).toStrictEqual([
      {
        file: {
          path: `${CAMERA_ID}/20261008T100000123Z.jpg`,
          bytes: new Uint8Array([9]),
          contentType: 'image/jpeg',
        },
        row: {
          deviceId: CAMERA_ID,
          eventId: EVENT_ID,
          kind: 'snapshot',
          storagePath: `${CAMERA_ID}/20261008T100000123Z.jpg`,
          startedAt: '2026-10-08T10:00:05.000Z',
          durationMs: null,
          bytes: 1,
        },
      },
      {
        file: {
          path: `${CAMERA_ID}/20261008T100000123Z.mp4`,
          bytes: new Uint8Array([1, 2]),
          contentType: 'video/mp4',
        },
        row: {
          deviceId: CAMERA_ID,
          eventId: EVENT_ID,
          kind: 'clip',
          storagePath: `${CAMERA_ID}/20261008T100000123Z.mp4`,
          startedAt: '2026-10-08T10:00:05.000Z',
          durationMs: CLIP_SECONDS * 1000,
          bytes: 2,
        },
      },
    ]);
  });

  it('records a clip of the asked length on demand, not linked to any event', async () => {
    const { db, go2rtc, service: cameras } = service();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    const path = `${CAMERA_ID}/20261008T100005000Z-manual.mp4`;
    await expect(cameras.recordClip(CAMERA_ID, 45)).resolves.toStrictEqual({
      storagePath: path,
      bytes: 2,
    });
    expect(go2rtc.calls).toContain(`clip ${CAMERA_ID} 45`);
    expect(db.recordings).toStrictEqual([
      {
        file: { path, bytes: new Uint8Array([1, 2]), contentType: 'video/mp4' },
        row: {
          deviceId: CAMERA_ID,
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
    const { service: cameras } = service();
    await expect(cameras.recordClip(CAMERA_ID, 10)).rejects.toThrow(
      `There is no camera stream named ${CAMERA_ID} on this hub.`,
    );
  });

  it('records nothing for other kinds, other devices, unregistered cameras or cameras with recording off', async () => {
    const { db, service: cameras } = service();
    await cameras.record(event);
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record({ ...event, kind: 'button' });
    await cameras.record({ ...event, deviceId: null });
    cameras.cameraChanged(cameraRow(false));
    await cameras.record(event);
    expect(db.recordings).toStrictEqual([]);
    cameras.cameraChanged(cameraRow(true));
    await cameras.record(event);
    expect(db.recordings).toHaveLength(2);
  });

  it('loads the recording setting of each camera', async () => {
    const { db, service: cameras } = service();
    db.cameras.set(CAMERA_ID, {
      deviceId: CAMERA_ID,
      streamName: CAMERA_ID,
      sourceUrlKind: 'rtsp',
      physicalPtz: false,
      twoWayAudio: false,
      recordEvents: false,
    });
    await cameras.load();
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(db.recordings).toStrictEqual([]);
  });

  it('reports a capture that failed and still stores the other one', async () => {
    const { db, service: cameras } = service(new Set(['frame']));
    await cameras.sync([camera({ go2rtcSource: 'rtsp://a' })]);
    await cameras.record(event);
    expect(db.recordings.map((entry) => entry.row.kind)).toStrictEqual(['clip']);
    expect(logs.events()).toContain('recording.failed');
  });
});
