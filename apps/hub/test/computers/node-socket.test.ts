import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  API_ENDPOINTS,
  ApiError,
  HUB_HARNESS_CONTROL,
  HUB_RUNTIME_CONTROL,
  NODE_AI_PROTOCOL,
  NODE_HARNESS_PROTOCOL,
  type HubHarnessControl,
  type NodeHello,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { RemoteComputerRuntimeHost } from '../../src/computers/remote-runtime-host';
import { bootServer, type Booted } from '../support/booted';
import { call, temporaryDirectory } from '../support/server';

const MACHINE_ID = 'a'.repeat(32);
const HELLO: NodeHello = {
  machineId: MACHINE_ID,
  hostname: 'desk',
  os: { name: 'Linux', kernel: '7.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'cpu', threads: 4, hybrid: false, kinds: [] },
  memoryBytes: 1024,
  interfaces: [],
  bootedAt: '2026-10-01T00:00:00.000Z',
  features: [],
  role: 'pc',
  power: [],
  actions: [],
  permissions: [],
};
const REVOKED = 4001;

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await booted.server.stop();
  await directory.remove();
});

async function pair(): Promise<{ readonly token: string; readonly deviceId: string }> {
  const issued = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/nodes/pairing',
    body: { url: booted.base },
  });
  const { code } = API_ENDPOINTS.pairComputerNode.response.parse(issued.body);
  const claimed = await call(booted.base, null, {
    method: 'POST',
    path: '/api/nodes/pairing/claim',
    body: { code, hello: HELLO },
  });
  const paired = API_ENDPOINTS.claimComputerNode.response.parse(claimed.body);
  return { token: paired.token, deviceId: paired.device_id };
}

async function open(path: string, protocol: string, token: string): Promise<WebSocket> {
  const socket = new WebSocket(`${booted.base.replace('http', 'ws')}${path}`, [protocol], {
    headers: { authorization: `Bearer ${token}` },
  });
  sockets.push(socket);
  await once(socket, 'open');
  return socket;
}

function nextText(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('message', (data: Buffer) => {
      resolve(JSON.parse(data.toString('utf8')));
    });
  });
}

async function stillAnswers(socket: WebSocket): Promise<void> {
  const ponged = once(socket, 'pong');
  socket.ping();
  await ponged;
  expect(socket.readyState).toBe(WebSocket.OPEN);
}

async function revoke(deviceId: string): Promise<void> {
  await call(booted.base, booted.owner, {
    method: 'DELETE',
    path: `/api/computers/${deviceId}/node`,
  });
}

describe('the computer runtime socket', () => {
  it('welcomes a paired computer, survives bad frames and closes on revocation', async () => {
    const { token, deviceId } = await pair();
    const socket = await open('/api/nodes/socket', NODE_AI_PROTOCOL, token);
    const welcome = nextText(socket);
    socket.send(JSON.stringify({ type: 'hello', protocol: 2, hello: HELLO, runtimes: ['claude'] }));
    expect(HUB_RUNTIME_CONTROL.parse(await welcome)).toMatchObject({
      type: 'welcome',
      device_id: deviceId,
    });

    socket.send('not json');
    socket.send(JSON.stringify({ type: 'unknown' }));
    socket.send(Buffer.from([1, 2, 3]));
    await stillAnswers(socket);

    const closed = once(socket, 'close');
    await revoke(deviceId);
    expect((await closed)[0]).toBe(REVOKED);
  });

  it('does not take a computer frame before the hello', async () => {
    const { token, deviceId } = await pair();
    const socket = await open('/api/nodes/socket', NODE_AI_PROTOCOL, token);
    const computer = (hello: NodeHello): string =>
      JSON.stringify({ type: 'computer', frame: { type: 'hello', hello } });
    socket.send(computer(HELLO));
    await stillAnswers(socket);

    const welcome = nextText(socket);
    socket.send(JSON.stringify({ type: 'hello', protocol: 2, hello: HELLO, runtimes: ['claude'] }));
    await welcome;

    const apps = await call(booted.base, booted.owner, {
      method: 'GET',
      path: `/api/computers/${deviceId}/apps`,
    });
    expect(apps.status).toBe(409);
  });

  it('refuses a socket opened without its subprotocol', async () => {
    const { token } = await pair();
    const socket = new WebSocket(`${booted.base.replace('http', 'ws')}/api/nodes/socket`, {
      headers: { authorization: `Bearer ${token}` },
    });
    sockets.push(socket);
    const cause = await new Promise<Error>((resolve) => {
      socket.once('error', resolve);
    });
    expect(cause.message).toContain('400');
  });
});

describe('the computer harness socket', () => {
  it('welcomes a paired computer, survives bad frames and closes on revocation', async () => {
    const { token, deviceId } = await pair();
    const socket = await open('/api/nodes/harness', NODE_HARNESS_PROTOCOL, token);
    const welcome = nextText(socket);
    socket.send(
      JSON.stringify({
        type: 'harness_connect',
        protocol: 1,
        device_id: deviceId,
        runtime_instance: randomUUID(),
        machine_id: MACHINE_ID,
      }),
    );
    expect(await welcome).toMatchObject({ type: 'harness_welcome', device_id: deviceId });

    socket.send('not json');
    socket.send(JSON.stringify({ type: 'harness_reply' }));
    await stillAnswers(socket);

    const closed = once(socket, 'close');
    await revoke(deviceId);
    expect((await closed)[0]).toBe(REVOKED);
  });
});

describe('a call on the computer harness socket', () => {
  async function connected(): Promise<{
    readonly socket: WebSocket;
    readonly binding: { device_id: string; generation: string; runtime_instance: string };
  }> {
    const { token, deviceId } = await pair();
    const socket = await open('/api/nodes/harness', NODE_HARNESS_PROTOCOL, token);
    const instance = randomUUID();
    const welcome = nextText(socket);
    socket.send(
      JSON.stringify({
        type: 'harness_connect',
        protocol: 1,
        device_id: deviceId,
        runtime_instance: instance,
        machine_id: MACHINE_ID,
      }),
    );
    const frame = HUB_HARNESS_CONTROL.parse(await welcome);
    if (frame.type !== 'harness_welcome') throw new Error('expected a welcome');
    return {
      socket,
      binding: { device_id: deviceId, generation: frame.generation, runtime_instance: instance },
    };
  }

  async function ask(
    connection: Awaited<ReturnType<typeof connected>>,
    request: unknown,
  ): Promise<Extract<HubHarnessControl, { type: 'harness_call_result' }>['result']> {
    const id = randomUUID();
    const answer = nextText(connection.socket);
    connection.socket.send(
      JSON.stringify({ ...connection.binding, type: 'harness_call', id, request }),
    );
    const frame = HUB_HARNESS_CONTROL.parse(await answer);
    if (frame.type !== 'harness_call_result' || frame.id !== id)
      throw new Error('expected the answer to this call');
    return frame.result;
  }

  it('answers with the hub value and keeps the socket for the next call', async () => {
    const connection = await connected();
    const answer = await ask(connection, { operation: 'tools' });
    expect(answer.ok && Array.isArray(answer.value)).toBe(true);
    expect(await ask(connection, { operation: 'tools' })).toMatchObject({ ok: true });
  });

  it('answers a refused call with the hub error code instead of dropping the socket', async () => {
    const connection = await connected();
    expect(await ask(connection, { operation: 'stat', session_id: randomUUID() })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(await ask(connection, { operation: 'tools' })).toMatchObject({ ok: true });
  });
});

describe('a computer harness that reconnects', () => {
  async function welcomeFor(
    token: string,
    deviceId: string,
    instance: string,
  ): Promise<{ readonly socket: WebSocket; readonly generation: string }> {
    const socket = await open('/api/nodes/harness', NODE_HARNESS_PROTOCOL, token);
    const welcome = nextText(socket);
    socket.send(
      JSON.stringify({
        type: 'harness_connect',
        protocol: 1,
        device_id: deviceId,
        runtime_instance: instance,
        machine_id: MACHINE_ID,
      }),
    );
    const frame = HUB_HARNESS_CONTROL.parse(await welcome);
    if (frame.type !== 'harness_welcome') throw new Error('expected a welcome');
    return { socket, generation: frame.generation };
  }

  it('keeps the runtime generation after a dropped socket and renews it for a restarted runtime', async () => {
    const { token, deviceId } = await pair();
    const instance = randomUUID();
    const first = await welcomeFor(token, deviceId, instance);
    const closed = once(first.socket, 'close');
    first.socket.terminate();
    await closed;

    const second = await welcomeFor(token, deviceId, instance);
    expect(second.generation).toBe(first.generation);

    const restarted = await welcomeFor(token, deviceId, randomUUID());
    expect(restarted.generation).not.toBe(first.generation);
  });
});

describe('a remote runtime host', () => {
  function hostWithSent(): {
    readonly host: RemoteComputerRuntimeHost;
    readonly sent: { id: string }[];
    readonly deviceId: string;
    readonly generation: string;
  } {
    const sent: { id: string }[] = [];
    const deviceId = randomUUID();
    const generation = randomUUID();
    const host = new RemoteComputerRuntimeHost('claude', deviceId, generation, (frame) => {
      if (frame.type === 'request') sent.push({ id: frame.id });
    });
    return { host, sent, deviceId, generation };
  }

  it('raises a computer failure as the API error it reports', async () => {
    const { host, sent, deviceId, generation } = hostWithSent();
    const outcome = host.read({ runtime: 'claude', request: { operation: 'status' } });
    const [request] = sent;
    host.receive({
      type: 'reply',
      device_id: deviceId,
      generation,
      id: request?.id ?? '',
      result: { ok: false, failure: { code: 'not_found', message: 'The folder does not exist.' } },
    });

    await expect(outcome).rejects.toSatisfy(
      (cause: unknown) =>
        cause instanceof ApiError &&
        cause.code === 'not_found' &&
        cause.message === 'The folder does not exist.',
    );
  });
});
