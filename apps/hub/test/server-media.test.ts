import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { CAMERA } from './support/fake-provider';
import { useBootedServer } from './support/booted';
import { call, openLive } from './support/server';

const suite = useBootedServer({ linked: true });

async function cameraId(): Promise<string> {
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await call(suite.current.base, suite.current.owner, { method: 'GET', path: '/api/devices' }))
      .body,
  );
  return devices.find((device) => device.external_id === CAMERA.externalId)?.id ?? '';
}

describe('camera media through the server', () => {
  it('relays a WebRTC offer to go2rtc and refuses a device that is not a camera', async () => {
    const camera = await cameraId();
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: `/api/cameras/${camera}/webrtc`,
          body: { sdp: 'v=0' },
        })
      ).body,
    ).toStrictEqual({
      sdp: 'answer:v=0',
    });
    const other = await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/cameras/0d000000-0000-4000-8000-000000000001/webrtc',
      body: { sdp: 'v=0' },
    });
    expect(other).toMatchObject({ status: 503, body: { error: { code: 'camera_unavailable' } } });
  });

  it('relays the MSE stream over a signed WebSocket and refuses an unsigned one', async () => {
    const camera = await cameraId();
    const link = API_ENDPOINTS.cameraStream.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: `/api/cameras/${camera}/mse`,
        })
      ).body,
    );
    const socket = new WebSocket(`${suite.current.base.replace('http', 'ws')}${link.url}`);
    const echoed = new Promise<string>((resolve) => {
      socket.once('message', (data: Buffer) => {
        resolve(data.toString('utf8'));
      });
    });
    socket.once('open', () => {
      socket.send('hello');
    });
    expect(await echoed).toBe('echo:hello');
    socket.close();
    const unsigned = new WebSocket(
      `${suite.current.base.replace('http', 'ws')}/media/cameras/${camera}/mse`,
    );
    const refusal = await new Promise<number>((resolve) => {
      unsigned.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0);
      });
    });
    expect(refusal).toBe(401);
  });

  it('serves a live frame through a short-lived signed snapshot link', async () => {
    const camera = await cameraId();
    const reply = await call(suite.current.base, suite.current.owner, {
      method: 'GET',
      path: `/api/cameras/${camera}/snapshot`,
    });
    const link = API_ENDPOINTS.cameraSnapshot.response.parse(reply.body);
    expect(link.url).toMatch(
      new RegExp(`^/media/cameras/${camera}/snapshot\\?expires=\\d+&signature=[0-9a-f]{64}$`),
    );
    const frame = await fetch(`${suite.current.base}${link.url}`);
    expect(frame.status).toBe(200);
    expect(frame.headers.get('content-type')).toBe('image/jpeg');
    expect(frame.headers.get('cache-control')).toBe('no-store');
    expect([...new Uint8Array(await frame.arrayBuffer())]).toStrictEqual([0xff, 0xd8, 0xff]);
    expect((await fetch(`${suite.current.base}/media/cameras/${camera}/snapshot`)).status).toBe(
      401,
    );
    expect((await fetch(`${suite.current.base}${link.url}`, { method: 'POST' })).status).toBe(404);
    suite.current.moveClock(11 * 60_000);
    expect((await fetch(`${suite.current.base}${link.url}`)).status).toBe(410);
    const other = await call(suite.current.base, suite.current.owner, {
      method: 'GET',
      path: '/api/cameras/0d000000-0000-4000-8000-000000000001/snapshot',
    });
    expect(other).toMatchObject({ status: 503, body: { error: { code: 'camera_unavailable' } } });
    expect(
      (
        await call(suite.current.base, null, {
          method: 'GET',
          path: `/api/cameras/${camera}/snapshot`,
        })
      ).status,
    ).toBe(401);
  });

  it('records a camera event and serves the files through short-lived signed links with ranges', async () => {
    const camera = await cameraId();
    const live = await openLive(suite.current.base, suite.current.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['recordings'] }));
    await live.next((message) => message.type === 'subscribed');
    suite.current.fake.adapter.sink?.event({
      externalId: CAMERA.externalId,
      kind: 'doorbell',
      occurredAt: '2026-10-08T10:00:00Z',
      details: {},
    });
    await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'recordings' &&
        message.record?.kind === 'clip',
    );
    live.socket.close();
    const recordings = API_ENDPOINTS.listRecordings.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'GET',
          path: `/api/recordings?deviceIds=${camera}`,
        })
      ).body,
    );
    const clip = recordings.find((recording) => recording.kind === 'clip');
    const links = API_ENDPOINTS.recordingLinks.response.parse(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'POST',
          path: '/api/recordings/links',
          body: { ids: [clip?.id] },
        })
      ).body,
    );
    const url = `${suite.current.base}${links[0]?.url ?? ''}`;
    const whole = await fetch(url);
    expect(whole.headers.get('content-type')).toBe('video/mp4');
    expect(await whole.text()).toBe('0123456789');
    const part = await fetch(url, { headers: { range: 'bytes=2-4' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-4/10');
    expect(await part.text()).toBe('234');
    expect(await (await fetch(url, { headers: { range: 'bytes=-3' } })).text()).toBe('789');
    expect((await fetch(url, { headers: { range: 'bytes=20-' } })).status).toBe(400);
    expect((await fetch(url, { headers: { range: 'lines=1-2' } })).status).toBe(400);
    expect((await fetch(`${suite.current.base}/media/recordings/${clip?.id ?? ''}`)).status).toBe(
      401,
    );
    expect(
      (await fetch(url.replace(/signature=[0-9a-f]+/, `signature=${'0'.repeat(64)}`))).status,
    ).toBe(401);
    suite.current.moveClock(11 * 60_000);
    expect((await fetch(url)).status).toBe(410);
    await call(suite.current.base, suite.current.owner, {
      method: 'DELETE',
      path: `/api/recordings/${clip?.id ?? ''}`,
    });
    expect(
      (
        await call(suite.current.base, suite.current.owner, {
          method: 'GET',
          path: '/api/recordings',
        })
      ).body,
    ).toHaveLength(1);
  });

  it('records a clip on demand as a hub command', async () => {
    const camera = await cameraId();
    const live = await openLive(suite.current.base, suite.current.owner);
    live.socket.send(JSON.stringify({ type: 'subscribe', tables: ['commands'] }));
    await live.next((message) => message.type === 'subscribed');
    await call(suite.current.base, suite.current.owner, {
      method: 'POST',
      path: '/api/commands',
      body: {
        device_id: null,
        capability: 'hub:record_clip',
        value: { deviceId: camera, seconds: 10 },
      },
    });
    const done = await live.next(
      (message) =>
        message.type === 'change' &&
        message.table === 'commands' &&
        message.record?.status === 'succeeded',
    );
    expect(done).toMatchObject({ record: { result: { bytes: 10 } } });
    live.socket.close();
  });
});
