import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Agent, fetch, request } from 'undici';
import { z } from 'zod';

const open: Server[] = [];

afterEach(() => {
  for (const server of open.splice(0)) server.close();
});

async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  open.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server not listening');
  return `http://127.0.0.1:${String(address.port)}`;
}

describe('undici contract', () => {
  it('fetches through an Agent dispatcher and streams the body in chunks', async () => {
    const base = await serve((_req, res) => {
      res.setHeader('x-origin', 'target');
      res.end('0123456789');
    });
    const agent = new Agent({ connect: { rejectUnauthorized: true } });
    const response = await fetch(`${base}/`, { dispatcher: agent });
    expect(response.headers.get('x-origin')).toBe('target');
    const reader = response.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(Buffer.from(z.instanceof(Uint8Array).parse(first.value)).toString()).toBe('0123456789');
    await agent.close();
  });

  it('refuses a redirect when asked to', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(302, { location: '/elsewhere' }).end();
    });
    await expect(fetch(`${base}/`, { redirect: 'error' })).rejects.toThrow();
  });

  it('stops a request through an AbortSignal', async () => {
    const base = await serve(() => undefined);
    await expect(fetch(`${base}/`, { signal: AbortSignal.timeout(50) })).rejects.toThrow();
  });

  it('answers a low-level request with its status code and a readable body', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(401, { 'www-authenticate': 'Digest realm="x"' }).end('no');
    });
    const reply = await request(`${base}/`);
    expect(reply.statusCode).toBe(401);
    expect(reply.headers['www-authenticate']).toBe('Digest realm="x"');
    expect(await reply.body.text()).toBe('no');
  });
});
