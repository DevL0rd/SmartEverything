import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpEffects, type HttpRequest } from '../../../src/automations/effects/http';
import { isLocalAddress, publicOnlyLookup } from '../../../src/automations/effects/http-guard';
import type { HttpAnswer } from '../../../src/automations/effects/http-transport';
import { AutomationRunCancelledError } from '../../../src/automations/effects/run-abort';
import { FakeClock } from '../../support/fake-clock';
import { testRun } from './support';

interface Seen {
  readonly authorization: string | undefined;
  readonly key: string | undefined;
  readonly url: string | undefined;
}

type Handler = (request: IncomingMessage, response: ServerResponse, body: string) => void;

const SECRET_ID = 'secret-1';
const SECRET_VALUE = 'hunter2-value';
const START = '2026-10-08T12:00:00.000Z';

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
});

async function serve(handler: Handler): Promise<string> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      handler(request, response, Buffer.concat(chunks).toString('utf8'));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('The server has no port.');
  return `http://127.0.0.1:${String(address.port)}`;
}

function call(overrides: Partial<HttpRequest>): HttpRequest {
  return {
    url: 'http://127.0.0.1:1/',
    method: 'GET',
    headers: {},
    query: {},
    body: undefined,
    bodyKind: 'json',
    auth: undefined,
    timeoutMs: 30_000,
    followRedirects: true,
    responseKind: 'auto',
    acceptStatus: [],
    allowLocalNetwork: true,
    ...overrides,
  };
}

function effects(clock = new FakeClock(START)): HttpEffects {
  return new HttpEffects({ resolve: (id) => (id === SECRET_ID ? SECRET_VALUE : null) }, clock);
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

describe('http request effect', () => {
  it('returns the status, headers and decoded body', async () => {
    const base = await serve((_request, response) => {
      json(response, { power: 12.5 });
    });
    const result = await effects().request(call({ url: `${base}/price` }), testRun());
    expect(result).toMatchObject({ status: 200, ok: true, body: { power: 12.5 } });
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('sends a json body with its content type', async () => {
    const seen: string[] = [];
    const base = await serve((request, response, body) => {
      seen.push(`${request.method ?? ''} ${request.headers['content-type'] ?? ''} ${body}`);
      response.end('ok');
    });
    const result = await effects().request(
      call({ url: base, method: 'POST', body: { a: 1 }, query: { q: 'x y' } }),
      testRun(),
    );
    expect(result.body).toBe('ok');
    expect(seen).toStrictEqual(['POST application/json {"a":1}']);
  });

  it('sends the secret as each scheme asks and never returns it', async () => {
    const seen: Seen[] = [];
    const base = await serve((request, response) => {
      const key = request.headers['x-token'];
      seen.push({
        authorization: request.headers.authorization,
        key: Array.isArray(key) ? key.join(',') : key,
        url: request.url,
      });
      json(response, { ok: true });
    });
    const run = async (auth: HttpRequest['auth']): Promise<unknown> =>
      effects().request(call({ url: base, auth }), testRun());
    const results = [
      await run({ secret: SECRET_ID, scheme: 'bearer' }),
      await run({ secret: SECRET_ID, scheme: 'basic', name: 'user' }),
      await run({ secret: SECRET_ID, scheme: 'header', name: 'x-token' }),
      await run({ secret: SECRET_ID, scheme: 'query', name: 'token' }),
    ];
    expect(seen[0]?.authorization).toBe(`Bearer ${SECRET_VALUE}`);
    expect(seen[1]?.authorization).toBe(
      `Basic ${Buffer.from(`user:${SECRET_VALUE}`).toString('base64')}`,
    );
    expect(seen[2]?.key).toBe(SECRET_VALUE);
    expect(seen[3]?.url).toBe(`/?token=${SECRET_VALUE}`);
    expect(JSON.stringify(results)).not.toContain(SECRET_VALUE);
  });

  it('refuses credential headers and names the auth option', async () => {
    for (const name of ['Authorization', 'cookie', 'X-Api-Key', 'proxy-authorization']) {
      await expect(
        effects().request(call({ headers: { [name]: 'x' } }), testRun()),
      ).rejects.toMatchObject({ kind: 'Invalid' });
    }
  });

  it('fails plainly when the secret is gone', async () => {
    await expect(
      effects().request(call({ auth: { secret: 'missing', scheme: 'bearer' } }), testRun()),
    ).rejects.toMatchObject({ kind: 'NotFound' });
  });

  it('keeps the secret out of the failure when the server cannot be reached', async () => {
    const error = await effects()
      .request(
        call({
          url: 'http://127.0.0.1:1/path',
          auth: { secret: SECRET_ID, scheme: 'query', name: 'token' },
        }),
        testRun(),
      )
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ kind: 'Unreachable' });
    expect(error instanceof Error ? error.message : '').not.toContain(SECRET_VALUE);
    expect(error).toBeInstanceOf(Error);
  });

  it('refuses a status outside 200 to 299 unless it is accepted', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(404).end('nope');
    });
    await expect(effects().request(call({ url: base }), testRun())).rejects.toMatchObject({
      kind: 'Refused',
    });
    const accepted = await effects().request(call({ url: base, acceptStatus: [404] }), testRun());
    expect(accepted).toMatchObject({ status: 404, ok: false, body: 'nope' });
  });

  it('follows redirects and drops the secret when the host changes', async () => {
    const seen: (string | undefined)[] = [];
    const other = await serve((request, response) => {
      seen.push(request.headers.authorization);
      json(response, { where: 'other' });
    });
    const first = await serve((request, response) => {
      seen.push(request.headers.authorization);
      response.writeHead(302, { location: `${other}/there` }).end();
    });
    const result = await effects().request(
      call({ url: first, auth: { secret: SECRET_ID, scheme: 'bearer' } }),
      testRun(),
    );
    expect(result.body).toStrictEqual({ where: 'other' });
    expect(seen).toStrictEqual([`Bearer ${SECRET_VALUE}`, undefined]);
  });

  it('returns the redirect itself when following is switched off', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(302, { location: '/next' }).end();
    });
    const result = await effects().request(
      call({ url: base, followRedirects: false, acceptStatus: [302] }),
      testRun(),
    );
    expect(result).toMatchObject({ status: 302, headers: { location: '/next' } });
  });

  it('stops a redirect loop', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(302, { location: '/again' }).end();
    });
    await expect(effects().request(call({ url: base }), testRun())).rejects.toMatchObject({
      kind: 'Refused',
    });
  });

  it('reports an answer that is not the JSON it claims', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{broken');
    });
    await expect(effects().request(call({ url: base }), testRun())).rejects.toMatchObject({
      kind: 'Invalid',
    });
  });

  it('gives an empty body for a head request', async () => {
    const base = await serve((_request, response) => {
      response.writeHead(200).end();
    });
    const result = await effects().request(call({ url: base, method: 'HEAD' }), testRun());
    expect(result.body).toBe('');
  });

  it('times out through the clock and cancels with the run', async () => {
    const base = await serve(() => undefined);
    const clock = new FakeClock(START);
    const waiting = effects(clock)
      .request(call({ url: base, timeoutMs: 5_000 }), testRun())
      .catch((cause: unknown) => cause);
    await new Promise((resolve) => setImmediate(resolve));
    clock.advanceTo('2026-10-08T12:00:05.000Z');
    expect(await waiting).toMatchObject({ kind: 'Timeout' });
    const run = testRun();
    const cancelled = effects(clock)
      .request(call({ url: base }), run)
      .catch((cause: unknown) => cause);
    await new Promise((resolve) => setImmediate(resolve));
    run.controller.abort();
    expect(await cancelled).toBeInstanceOf(AutomationRunCancelledError);
    expect(clock.pending()).toStrictEqual([]);
  });
});

describe('http request effect on the local network', () => {
  const closed: HttpAnswer = { status: 200, headers: {}, body: Buffer.from('') };

  it('refuses local addresses when they are not allowed', async () => {
    const reached: string[] = [];
    const guarded = new HttpEffects(
      { resolve: (): null => null },
      new FakeClock(START),
      (sent): Promise<HttpAnswer> => {
        reached.push(sent.url.href);
        return Promise.resolve(closed);
      },
    );
    for (const url of [
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest',
      'http://100.64.0.1/',
    ]) {
      await expect(
        guarded.request(call({ url, allowLocalNetwork: false }), testRun()),
      ).rejects.toMatchObject({ kind: 'Forbidden' });
    }
    expect(reached).toStrictEqual([]);
  });

  it('checks the address of every redirect', async () => {
    const reached: string[] = [];
    const guarded = new HttpEffects(
      { resolve: (): null => null },
      new FakeClock(START),
      (sent): Promise<HttpAnswer> => {
        reached.push(sent.url.href);
        return Promise.resolve({
          status: 302,
          headers: { location: 'http://192.168.1.10/admin' },
          body: Buffer.from(''),
        });
      },
    );
    await expect(
      guarded.request(
        call({ url: 'http://93.184.216.34/start', allowLocalNetwork: false }),
        testRun(),
      ),
    ).rejects.toMatchObject({ kind: 'Forbidden' });
    expect(reached).toStrictEqual(['http://93.184.216.34/start']);
  });

  it('checks the address a name resolves to at the moment of connecting', async () => {
    const base = await serve((_request, response) => {
      response.end('inside');
    });
    const port = new URL(base).port;
    await expect(
      effects().request(
        call({ url: `http://localhost:${port}/`, allowLocalNetwork: false }),
        testRun(),
      ),
    ).rejects.toMatchObject({ kind: 'Forbidden' });
    const allowed = await effects().request(
      call({ url: `http://localhost:${port}/`, allowLocalNetwork: true }),
      testRun(),
    );
    expect(allowed.body).toBe('inside');
  });

  it('classifies the private, loopback and link local ranges', () => {
    expect(
      [
        '127.0.0.1',
        '10.1.2.3',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.0.1',
        '169.254.1.1',
        '::1',
        'fd00::1',
        'fe80::1',
        '::ffff:7f00:1',
        '0.0.0.0',
      ].map(isLocalAddress),
    ).toStrictEqual(Array<boolean>(11).fill(true));
    expect(
      ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111'].map(isLocalAddress),
    ).toStrictEqual([false, false, false, false]);
  });

  it('answers a lookup of a local name with a refusal', async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      publicOnlyLookup('localhost', {}, (cause) => {
        resolve(cause);
      });
    });
    expect(error).toMatchObject({ code: 'ELOCALNET' });
  });
});
