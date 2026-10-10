import { go2rtcCameraMotor, type CameraMotor } from '../../src/adapters/xiaomi/camera-motor';
import { go2rtcClient } from '../../src/cameras/go2rtc-client';

interface MotorCall {
  readonly stream: string;
  readonly operation: number;
}

export interface FakeGo2rtc {
  readonly playing: Set<string>;
  readonly idle: Set<string>;
  readonly calls: MotorCall[];
  readonly requests: string[];
  failWith: string | null;
  readonly fetch: typeof fetch;
}

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

function motorReply(go2rtc: FakeGo2rtc, method: string, url: URL): Response {
  if (method !== 'POST') {
    return text(405, 'POST only');
  }
  const operation = Number(url.searchParams.get('operation'));
  if (!Number.isInteger(operation) || operation < 1 || operation > 5) {
    return text(400, 'operation must be 1 (left), 2 (right), 3 (up), 4 (down) or 5 (calibrate)');
  }
  const stream = url.searchParams.get('src') ?? '';
  if (!go2rtc.playing.has(stream) && !go2rtc.idle.has(stream)) {
    return text(404, `xiaomi: motor: no stream "${stream}"`);
  }
  if (!go2rtc.playing.has(stream)) {
    return text(409, `xiaomi: motor: stream "${stream}" has no connected source with a motor`);
  }
  if (go2rtc.failWith !== null) {
    return text(502, `xiaomi: motor: ${go2rtc.failWith}`);
  }
  go2rtc.calls.push({ stream, operation });
  return text(200, '');
}

export function fakeGo2rtc(): FakeGo2rtc {
  const go2rtc: FakeGo2rtc = {
    playing: new Set(),
    idle: new Set(),
    calls: [],
    requests: [],
    failWith: null,
    fetch: (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? 'GET';
      go2rtc.requests.push(`${method} ${url.pathname}${url.search}`);
      return Promise.resolve(
        url.pathname === '/api/xiaomi/motor'
          ? motorReply(go2rtc, method, url)
          : text(404, `no fake go2rtc route for ${url.pathname}`),
      );
    },
  };
  return go2rtc;
}

function streamOfCamera(did: string): string | null {
  return did.startsWith('100') ? `stream-${did}` : null;
}

export function fakeMotor(go2rtc: FakeGo2rtc): CameraMotor {
  const client = go2rtcClient({
    baseUrl: 'http://127.0.0.1:1984',
    username: 'hub',
    password: 'secret',
    fetch: go2rtc.fetch,
  });
  return go2rtcCameraMotor(client, streamOfCamera);
}
