import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LoopbackListener,
  type LoopbackListenerOptions,
} from '../../src/client-network/loopback-listener';
import { captureLogs } from '../support/logs';

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

function listener(
  serve?: LoopbackListenerOptions<string, string>['serve'],
): LoopbackListener<string, string> {
  const created = new LoopbackListener<string, string>({
    name: 'Test listener',
    event: 'guest.refused',
    idPattern: /^\/grant\/([0-9a-f]{64})$/,
    unknownMessage: 'Grant is unknown',
    retiredMessage: 'Grant retired',
    serve:
      serve ??
      ((_request, response, _id, entry): Promise<void> => {
        response.end(entry.value);
        return Promise.resolve();
      }),
  });
  closers.push(() => {
    created.close();
  });
  return created;
}
function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve) => {
    const socket: Socket = connect(port, '127.0.0.1', () => {
      socket.write(text);
    });
    let received = '';
    socket.on('data', (chunk: Buffer) => {
      received += chunk.toString('utf8');
    });
    socket.on('close', () => {
      resolve(received);
    });
    socket.on('error', () => {
      resolve(received);
    });
  });
}
function portOf(host: string): number {
  return Number(host.split(':')[1]);
}

describe('loopback listener', () => {
  it('listens on loopback with a random port and gives 64-hex grant ids', async () => {
    const a = listener();
    const b = listener();
    await a.start();
    await b.start();
    expect(a.host).toMatch(/^127\.0\.0\.1:\d+$/);
    expect(a.host).not.toBe(b.host);
    const first = a.add('o', 'x', undefined, () => undefined);
    const second = a.add('o', 'x', undefined, () => undefined);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it('refuses a second start', async () => {
    const created = listener();
    await created.start();
    await expect(created.start()).rejects.toThrow('already running');
  });

  it('serves a known grant and answers 409 with a reason for an unknown or released one', async () => {
    const logs = captureLogs();
    const created = listener();
    await created.start();
    const id = created.add('o', 'hello', undefined, () => undefined);
    const ok = await fetch(`http://${created.host}/grant/${id}`);
    expect(await ok.text()).toBe('hello');
    created.release(id);
    const gone = await fetch(`http://${created.host}/grant/${id}`);
    expect(gone.status).toBe(409);
    expect(await gone.json()).toEqual({ error: 'Grant is unknown' });
    expect(logs.events()).toContain('guest.refused');
  });

  it('refuses a Host that differs from the listener', async () => {
    const created = listener();
    await created.start();
    const id = created.add('o', 'hello', undefined, () => undefined);
    const answer = await raw(
      portOf(created.host),
      `GET /grant/${id} HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n`,
    );
    expect(answer).toContain('403');
    expect(answer).not.toContain('hello');
  });

  it('destroys CONNECT and upgrade requests', async () => {
    const created = listener();
    await created.start();
    const port = portOf(created.host);
    const connectAnswer = await raw(
      port,
      `CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n`,
    );
    expect(connectAnswer).toBe('');
    const upgradeAnswer = await raw(
      port,
      `GET /grant/x HTTP/1.1\r\nHost: ${created.host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
    );
    expect(upgradeAnswer).toBe('');
  });

  it('aborts the entry controller on release, closeOwner and close, and retires on signal abort', async () => {
    const created = listener();
    await created.start();
    const signal = new AbortController();
    const retired: string[] = [];
    const a = created.add('one', 'x', signal.signal, (id) => {
      retired.push(id);
      created.release(id);
    });
    const b = created.add('two', 'x', undefined, () => undefined);
    const c = created.add('two', 'x', undefined, () => undefined);
    const controllerB = created.get(b)?.controller;
    created.releaseWhere((entry) => entry.owner === 'two');
    expect(controllerB?.signal.aborted).toBe(true);
    expect(created.get(b)).toBeUndefined();
    expect(created.get(c)).toBeUndefined();
    signal.abort(new Error('withdrawn'));
    expect(retired).toEqual([a]);
    expect(created.get(a)).toBeUndefined();
    const d = created.add('three', 'x', undefined, () => undefined);
    const controllerD = created.get(d)?.controller;
    created.close();
    expect(controllerD?.signal.aborted).toBe(true);
    expect(created.running).toBe(false);
    expect(created.origin).toBeUndefined();
  });

  it('finds a grant by owner and replaces its value', async () => {
    const created = listener();
    await created.start();
    const id = created.add('o', 'old', undefined, () => undefined);
    expect(created.find((entry) => entry.owner === 'o')).toBe(id);
    expect(created.find((entry) => entry.owner === 'p')).toBeUndefined();
    created.replace(id, 'new');
    const answer = await fetch(`http://${created.host}/grant/${id}`);
    expect(await answer.text()).toBe('new');
  });

  it('answers 502 when the serve handler fails', async () => {
    const created = listener(() => Promise.reject(new Error('boom')));
    await created.start();
    const id = created.add('o', 'x', undefined, () => undefined);
    const answer = await fetch(`http://${created.host}/grant/${id}`);
    expect(answer.status).toBe(502);
  });
});
