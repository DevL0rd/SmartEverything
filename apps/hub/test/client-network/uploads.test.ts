import { createServer, type IncomingMessage } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { HubUploads } from '../../src/client-network/uploads';

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

interface Received {
  readonly method: string;
  readonly length: string | undefined;
  readonly type: string | undefined;
  readonly bytes: number[];
}

async function serverOf(
  answer: (request: IncomingMessage, bytes: Buffer) => readonly [number, string],
): Promise<{ readonly url: string; readonly received: Received[] }> {
  const received: Received[] = [];
  const server = createServer((request, response) => {
    const parts: Buffer[] = [];
    request.on('data', (part: Buffer) => parts.push(part));
    request.on('end', () => {
      const bytes = Buffer.concat(parts);
      received.push({
        method: request.method ?? '',
        length: request.headers['content-length'],
        type: request.headers['content-type'],
        bytes: [...bytes],
      });
      const [status, body] = answer(request, bytes);
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return { url: `http://127.0.0.1:${String(address.port)}/api/upload`, received };
}

const owner = { id: 7 };

function uploadsOf(failed: string[] = []): HubUploads<typeof owner> {
  return new HubUploads({
    lease: (_scopeId, input): { readonly url: URL } => ({ url: new URL(input) }),
    failed: (scopeId): void => {
      failed.push(scopeId);
    },
  });
}

describe('streamed hub uploads', () => {
  it('streams every chunk as one body with its declared length and answers the hub reply', async () => {
    const hub = await serverOf((_request, bytes) => [200, JSON.stringify({ got: bytes.length })]);
    const uploads = uploadsOf();
    uploads.open(owner, {
      scopeId: 'scope',
      id: 'u1',
      url: hub.url,
      method: 'PUT',
      headers: { 'content-type': 'application/octet-stream', authorization: 'Bearer t' },
      length: 5,
    });
    expect(await uploads.send(owner, { id: 'u1', data: new Uint8Array([0, 255, 3]) })).toBe(true);
    expect(await uploads.send(owner, { id: 'u1', data: new Uint8Array([128, 9]) })).toBe(true);
    const answer = await uploads.finish(owner, 'u1');
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toStrictEqual({ got: 5 });
    expect(hub.received).toStrictEqual([
      {
        method: 'PUT',
        length: '5',
        type: 'application/octet-stream',
        bytes: [0, 255, 3, 128, 9],
      },
    ]);
  });

  it('answers a hub refusal as the hub sent it', async () => {
    const refusal = JSON.stringify({ error: { code: 'invalid_request', message: 'refused' } });
    const hub = await serverOf(() => [400, refusal]);
    const uploads = uploadsOf();
    uploads.open(owner, {
      scopeId: 'scope',
      id: 'u2',
      url: hub.url,
      method: 'PUT',
      headers: {},
      length: 1,
    });
    await uploads.send(owner, { id: 'u2', data: new Uint8Array([1]) });
    const answer = await uploads.finish(owner, 'u2');
    expect(answer.status).toBe(400);
    expect(answer.body).toBe(refusal);
  });

  it('stops an aborted upload without marking the route failed', async () => {
    const hub = await serverOf(() => [200, '{}']);
    const failed: string[] = [];
    const uploads = uploadsOf(failed);
    uploads.open(owner, {
      scopeId: 'scope',
      id: 'u3',
      url: hub.url,
      method: 'PUT',
      headers: {},
      length: 10,
    });
    await uploads.send(owner, { id: 'u3', data: new Uint8Array([1, 2]) });
    uploads.abort(owner, 'u3');
    await expect(uploads.send(owner, { id: 'u3', data: new Uint8Array([3]) })).rejects.toThrow(
      'Hub upload is not open',
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(failed).toStrictEqual([]);
    expect(hub.received).toStrictEqual([]);
  });

  it('refuses a second upload with the same id from the same owner', async () => {
    const hub = await serverOf(() => [200, '{}']);
    const uploads = uploadsOf();
    const open = {
      scopeId: 'scope',
      id: 'u4',
      url: hub.url,
      method: 'PUT',
      headers: {},
      length: 0,
    };
    uploads.open(owner, open);
    expect(() => {
      uploads.open(owner, open);
    }).toThrow('Hub upload ID exists');
    uploads.closeOwner(owner);
  });
});
