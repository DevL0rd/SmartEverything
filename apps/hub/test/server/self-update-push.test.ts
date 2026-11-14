import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError, UPDATE_PUSH_PATH } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readPushSecret, updatePushRoute } from '../../src/server/handlers/self-update-push';
import { sendError } from '../../src/server/http';
import { pushSignature } from '../../src/self-update/push-webhook';

const SECRET = 'fixture-secret';
const TIP = 'a'.repeat(40);
const BEFORE = 'b'.repeat(40);

let server: Server;
let base: string;
let secret: string | null;
let submitted: { tip: string; pushedFrom: string }[];

function payload(change: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ref: 'refs/heads/main',
    before: BEFORE,
    after: TIP,
    deleted: false,
    repository: { full_name: 'DevL0rd/SmartEverything' },
    ...change,
  });
}

async function post(
  body: string,
  headers: Record<string, string>,
  signed: string | null = SECRET,
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}${UPDATE_PUSH_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signed === null
        ? {}
        : { 'x-hub-signature-256': pushSignature(signed, Buffer.from(body)) }),
      ...headers,
    },
    body,
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(async () => {
  secret = SECRET;
  submitted = [];
  const route = updatePushRoute({
    secret: () => Promise.resolve(secret),
    target: () => Promise.resolve({ repository: 'devl0rd/smarteverything', branch: 'main' }),
    submit: (push) => {
      submitted.push(push);
      return Promise.resolve('00000000-0000-4000-8000-000000000001');
    },
  });
  server = createServer((request, response) => {
    route.handle(request, response, {}).catch((cause: unknown) => {
      if (cause instanceof ApiError) sendError(response, cause);
      else response.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('The test server has no port.');
  base = `http://127.0.0.1:${String(address.port)}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('push webhook endpoint', () => {
  it('queues a signed push to the configured branch', async () => {
    const reply = await post(payload(), { 'x-github-event': 'push' });
    expect(reply.status).toBe(202);
    expect(reply.body).toEqual({
      kind: 'queued',
      revisionId: '00000000-0000-4000-8000-000000000001',
    });
    expect(submitted).toEqual([{ tip: TIP, pushedFrom: BEFORE }]);
  });

  it('answers a signed ping and ignores pushes that are not for the configured branch', async () => {
    expect((await post('{"zen":"x"}', { 'x-github-event': 'ping' })).body).toEqual({
      kind: 'pong',
    });
    const other = await post(payload({ ref: 'refs/heads/dev' }), { 'x-github-event': 'push' });
    expect(other).toEqual({ status: 200, body: { kind: 'ignored', reason: 'other_branch' } });
    expect(submitted).toEqual([]);
  });

  it('refuses a missing or wrong signature without queueing', async () => {
    expect((await post(payload(), { 'x-github-event': 'push' }, null)).status).toBe(401);
    expect((await post(payload(), { 'x-github-event': 'push' }, 'wrong-secret')).status).toBe(401);
    expect(submitted).toEqual([]);
  });

  it('answers an unsigned request before any of its body arrives', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(`${base}${UPDATE_PUSH_PATH}`, {
        method: 'POST',
        headers: { 'content-length': '1000', 'x-github-event': 'push' },
      });
      request.once('response', (response) => {
        resolve(response.statusCode ?? 0);
        request.destroy();
      });
      request.once('error', reject);
      request.flushHeaders();
    });
    expect(status).toBe(401);
    expect(submitted).toEqual([]);
  });

  it('drops a signed body above the 25 MB cap GitHub documents for webhook payloads', async () => {
    const big = JSON.stringify({ padding: 'x'.repeat(26 * 1024 * 1024) });
    const reply = await post(big, { 'x-github-event': 'push' }).then(
      (answer) => answer.status,
      () => 'dropped',
    );
    expect([413, 'dropped']).toContain(reply);
    expect(submitted).toEqual([]);
  });

  it('stays idle with a not-found answer until the secret exists', async () => {
    secret = null;
    expect((await post(payload(), { 'x-github-event': 'push' })).status).toBe(404);
    expect(submitted).toEqual([]);
  });

  it('rejects a signed body that is not JSON or not a push', async () => {
    expect((await post('not json', { 'x-github-event': 'push' })).status).toBe(400);
    expect((await post('{"ref":"refs/heads/main"}', { 'x-github-event': 'push' })).status).toBe(
      400,
    );
  });
});

describe('push secret file', () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'push-secret-'));
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('reads the trimmed secret and treats a missing or empty file as not set up', async () => {
    const file = join(scratch, 'push-secret');
    expect(await readPushSecret(file)).toBeNull();
    await writeFile(file, '\n');
    expect(await readPushSecret(file)).toBeNull();
    await writeFile(file, 'abc123\n');
    expect(await readPushSecret(file)).toBe('abc123');
  });
});
