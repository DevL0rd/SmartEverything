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

function row(rangAt: string | null): unknown {
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
};

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

  it('snoozes and returns when the alarm will ring again', async () => {
    const later = '2030-01-01T07:09:00.000Z';
    const { hub } = await hubWith(({ url }) =>
      url.startsWith('/api/planner/rings')
        ? { status: 200, json: [row(null)] }
        : { status: 200, json: row(later) },
    );
    await expect(hub.snooze(alarm, DUE)).resolves.toEqual({ until: later });
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
