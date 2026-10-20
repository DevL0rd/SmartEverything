import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError, matchPath } from '@smarteverything/domain';
import type { WebhookCall } from '../../src/automations/webhooks/gateway';
import type { WebhookReply } from '../../src/automations/effects/webhook-replies';
import { webhookRoutes } from '../../src/server/handlers/automation-webhooks';

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

interface Seen {
  readonly calls: WebhookCall[];
}

async function serve(answer: WebhookReply | null): Promise<{ url: string; seen: Seen }> {
  const seen: Seen = { calls: [] };
  const routes = webhookRoutes({
    call: (call) => {
      seen.calls.push(call);
      return Promise.resolve(answer);
    },
  });
  const server = createServer((request, response) => {
    const route = routes.find((candidate) => candidate.method === request.method);
    const params = matchPath('/hooks/:path', new URL(request.url ?? '/', 'http://x').pathname);
    const handled =
      route === undefined || params === null
        ? Promise.reject(new ApiError('not_found', 'nothing'))
        : route.handle(request, response, params);
    handled.catch((cause: unknown) => {
      const error = cause instanceof ApiError ? cause : new ApiError('internal', 'failed');
      response.writeHead(error.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(error.body()));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { url: `http://127.0.0.1:${String(address.port)}`, seen };
}

const PATH = 'k3Jq9Zr2Lm8Xv5Bn7TcWd1';

describe('the webhook address', () => {
  it('offers GET, POST, PUT and DELETE on one secret address', () => {
    const routes = webhookRoutes({ call: () => Promise.resolve(null) });
    expect(routes.map((route) => route.method)).toEqual(['GET', 'POST', 'PUT', 'DELETE']);
    expect(new Set(routes.map((route) => route.path))).toEqual(new Set(['/hooks/:path']));
  });

  it('passes the method, query, headers and a JSON body on, and sends the answer back', async () => {
    const { url, seen } = await serve({
      status: 201,
      body: { ok: true },
      headers: { 'x-answer': 'yes' },
    });
    const response = await fetch(`${url}/hooks/${PATH}?a=1&b=two`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-source': 'ifttt' },
      body: JSON.stringify({ who: 'ann', n: [1, 2] }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('x-answer')).toBe('yes');
    expect(await response.json()).toEqual({ ok: true });
    expect(seen.calls).toHaveLength(1);
    expect(seen.calls[0]).toMatchObject({
      path: PATH,
      method: 'POST',
      body: { who: 'ann', n: [1, 2] },
      query: { a: '1', b: 'two' },
      headers: { 'x-source': 'ifttt', 'content-type': 'application/json' },
    });
  });

  it('reads a form body as fields and any other body as text', async () => {
    const { url, seen } = await serve({ status: 204, body: undefined, headers: {} });
    const form = await fetch(`${url}/hooks/${PATH}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=1&b=2',
    });
    expect(form.status).toBe(204);
    await fetch(`${url}/hooks/${PATH}`, { method: 'POST', body: 'plain words' });
    await fetch(`${url}/hooks/${PATH}`, { method: 'GET' });
    expect(seen.calls.map((call) => call.body)).toEqual([
      { a: '1', b: '2' },
      'plain words',
      undefined,
    ]);
  });

  it('refuses a body that says it is JSON and is not', async () => {
    const { url, seen } = await serve({ status: 202, body: { accepted: true }, headers: {} });
    const response = await fetch(`${url}/hooks/${PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{nope',
    });
    expect(response.status).toBe(400);
    expect(seen.calls).toEqual([]);
  });

  it('answers 404 when no automation takes the call', async () => {
    const { url } = await serve(null);
    const response = await fetch(`${url}/hooks/${PATH}`, { method: 'POST' });
    expect(response.status).toBe(404);
  });
});
