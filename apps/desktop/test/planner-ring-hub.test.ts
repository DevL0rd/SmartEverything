import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { RingHub, RingNotFoundError } from '../src/planner/ring-hub.js';
import type { DesktopRing } from '../src/planner/ring-types.js';

const ALARM = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const TIMER = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e02';
const CLIENT = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e03';
const RING = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e04';
const PROFILE = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e05';
const DUE = '2030-01-01T07:00:00.000Z';

interface Seen {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: string;
}

const servers: Server[] = [];

function row(rangAt: string | null, changes: Record<string, unknown> = {}): unknown {
  return {
    id: RING,
    kind: 'alarm',
    ref_id: ALARM,
    profile_id: PROFILE,
    due_at: DUE,
    rang_at: rangAt ?? DUE,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'rang',
    missed_reason: null,
    ...changes,
  };
}

async function body(request: IncomingMessage): Promise<string> {
  request.setEncoding('utf8');
  let text = '';
  for await (const chunk of request) text += String(chunk);
  return text;
}

async function hubWith(
  answer: (seen: Seen) => { status: number; json: unknown },
): Promise<{ hub: RingHub; seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = createServer((request, response) => {
    body(request)
      .then((text) => {
        const entry = {
          method: request.method ?? '',
          url: request.url ?? '',
          authorization: request.headers.authorization,
          body: text,
        };
        seen.push(entry);
        const { status, json } = answer(entry);
        if (typeof json === 'string') {
          response.writeHead(status, { 'content-type': 'audio/mpeg' });
          response.end(json);
          return;
        }
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(json));
      })
      .catch(() => {
        response.destroy();
      });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  const origin = `http://127.0.0.1:${String(port)}`;
  const hub = new RingHub({
    server: (): Promise<{ url: string; token: string }> =>
      Promise.resolve({ url: origin, token: 'tok' }),
    fetch: (input, init): Promise<Response> => fetch(input, init),
  });
  return { hub, seen };
}

const alarm: DesktopRing = {
  ringKey: `alarm:${ALARM}`,
  kind: 'alarm',
  refId: ALARM,
  dueAt: DUE,
  label: null,
  rampSeconds: 0,
  sound: { kind: 'tone', id: 'default' },
  snoozeLimit: 3,
  snoozes: 0,
  challenge: { kind: 'none' },
};

const SONG = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e06';
const NOW = new Date('2030-01-01T07:01:00.000Z');

function link(path: string): unknown {
  return { url: path, expiresAt: '2030-01-01T08:00:00.000Z' };
}

async function textOf(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('desktop ring hub', () => {
  it('finds the ring row by its due moment and dismisses it with the desktop credential', async () => {
    const { hub, seen } = await hubWith(({ url }) =>
      url.startsWith('/api/planner/rings')
        ? { status: 200, json: [row(null)] }
        : { status: 200, json: row(null) },
    );
    await hub.dismiss(alarm, DUE);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.url).toContain('/api/planner/rings?');
    expect(seen[0]?.authorization).toBe('Bearer tok');
    expect(seen[1]?.url).toBe(`/api/planner/alarms/${ALARM}/dismiss`);
    expect(JSON.parse(seen[1]?.body ?? '')).toEqual({ ringId: RING });
  });

  it('stops a timer by cancelling it', async () => {
    const { hub, seen } = await hubWith(() => ({ status: 200, json: {} }));
    await expect(
      hub.dismiss({ ...alarm, ringKey: `timer:${TIMER}`, kind: 'timer', refId: TIMER }, DUE),
    ).rejects.toThrow();
    expect(seen[0]?.url).toBe(`/api/planner/timers/${TIMER}/cancel`);
  });

  it('reports when the hub has no row for the ring', async () => {
    const { hub } = await hubWith(() => ({ status: 200, json: [] }));
    await expect(hub.snooze(alarm, DUE)).rejects.toBeInstanceOf(RingNotFoundError);
  });

  it('snoozes and returns when the alarm will ring again and how often it was snoozed', async () => {
    const later = '2030-01-01T07:09:00.000Z';
    const { hub } = await hubWith(({ url }) =>
      url.startsWith('/api/planner/rings')
        ? { status: 200, json: [row(null)] }
        : { status: 200, json: row(later, { snoozes: 2 }) },
    );
    await expect(hub.snooze(alarm, DUE)).resolves.toEqual({ until: later, snoozes: 2 });
  });

  it('tells whether another device stopped or snoozed the ring', async () => {
    const later = '2030-01-01T07:09:00.000Z';
    const answers = [
      row(null),
      row(null, { dismissed_at: '2030-01-01T07:00:30.000Z' }),
      row(later, { snoozes: 1 }),
    ];
    const { hub } = await hubWith(() => ({ status: 200, json: [answers.shift()] }));
    await expect(hub.elsewhere(alarm, DUE, NOW)).resolves.toEqual({ kind: 'ringing' });
    await expect(hub.elsewhere(alarm, DUE, NOW)).resolves.toEqual({ kind: 'dismissed' });
    await expect(hub.elsewhere(alarm, DUE, NOW)).resolves.toEqual({
      kind: 'snoozed',
      until: later,
      snoozes: 1,
    });
  });

  it('downloads a sound file through its signed Drive link', async () => {
    const file = `/media/drive/${SONG}/file?sig=abc`;
    const { hub, seen } = await hubWith(({ url }) => {
      if (url === '/api/drive/items/links') {
        return {
          status: 200,
          json: [
            {
              itemId: SONG,
              rev: 1,
              file: link(file),
              download: null,
              icon: null,
              thumb: null,
              preview: null,
              playable: null,
            },
          ],
        };
      }
      return url === file ? { status: 200, json: 'song bytes' } : { status: 404, json: {} };
    });
    await expect(textOf(await hub.soundFile(SONG))).resolves.toBe('song bytes');
    expect(JSON.parse(seen[0]?.body ?? '')).toEqual({ itemIds: [SONG] });
    expect(seen[1]?.url).toBe(file);
  });

  it('refuses a sound file the Hub will not serve', async () => {
    const { hub } = await hubWith(() => ({ status: 200, json: [] }));
    await expect(hub.soundFile(SONG)).rejects.toThrow('the Hub sent no link');
  });

  it('reads the client id once and treats a stale acknowledgement as false', async () => {
    const { hub, seen } = await hubWith(({ url }) => {
      if (url === '/api/session') return { status: 200, json: { client: { id: CLIENT } } };
      return { status: 409, json: { error: { code: 'conflict', message: 'stale' } } };
    });
    await expect(hub.clientId()).rejects.toThrow();
    expect(seen[0]?.url).toBe('/api/session');
    await expect(hub.acknowledge(CLIENT, 'h')).resolves.toBe(false);
  });
});
