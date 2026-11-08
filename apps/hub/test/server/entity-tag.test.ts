import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { matchesEntityTag, sendTagged } from '../../src/server/entity-tag';

let server: Server;
let url: string;

beforeEach(async () => {
  server = createServer((request, response) => {
    sendTagged(request, response, { index: 31 }, '31');
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  url = `http://127.0.0.1:${String(address.port)}/`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

describe('a tagged response', () => {
  it('sends the body with its tag and asks the client to revalidate', async () => {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('"31"');
    expect(response.headers.get('cache-control')).toBe('private, no-cache');
    await expect(response.json()).resolves.toStrictEqual({ index: 31 });
  });

  it('answers 304 with no body when the client already holds that tag', async () => {
    const response = await fetch(url, { headers: { 'if-none-match': '"30", W/"31"' } });
    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe('"31"');
    await expect(response.text()).resolves.toBe('');
  });

  it('sends the body again for another tag', async () => {
    const response = await fetch(url, { headers: { 'if-none-match': '"30"' } });
    expect(response.status).toBe(200);
  });
});

describe('matching a tag', () => {
  it('matches a listed, weak or wildcard tag and nothing else', () => {
    expect(matchesEntityTag(undefined, '7')).toBe(false);
    expect(matchesEntityTag('"7"', '7')).toBe(true);
    expect(matchesEntityTag('"6" , W/"7"', '7')).toBe(true);
    expect(matchesEntityTag('*', '7')).toBe(true);
    expect(matchesEntityTag('"70"', '7')).toBe(false);
    expect(matchesEntityTag('7', '7')).toBe(false);
  });
});
