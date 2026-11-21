import { API_ENDPOINTS, ApiError, NO_BODY, endpoint } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Caller } from '../../src/server/auth';
import { bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';
import { ResponseEncoder } from '../../src/server/responses/encoder';
import { bundledCodecWorker } from '../support/codec-worker';
import { temporaryDirectory } from '../support/server';

const COUNT = endpoint({
  method: 'GET',
  path: '/api/test/count',
  access: 'owner',
  summary: 'A count',
  params: z.strictObject({}),
  query: z.strictObject({}),
  body: NO_BODY,
  response: z.strictObject({ count: z.number(), unit: z.string().default('items') }),
});

const RAW = { params: {}, query: {}, body: undefined, remote: 'test', headers: {} } as const;

let opened: TestStore;
let caller: Caller;

beforeEach(async () => {
  opened = await testStore();
  const client = opened.store.clients.create(
    { name: 'Owner', platform: 'desktop', role: 'owner', tokenHash: 'c'.repeat(64) },
    true,
  );
  caller = { kind: 'client', client };
});

afterEach(async () => {
  await opened.close();
});

describe('a bound route', () => {
  it('returns a response that matches the endpoint', async () => {
    const route = bound(COUNT, () => ({ count: 3, unit: 'cups' }));
    await expect(route.run(caller, RAW, testLogger())).resolves.toStrictEqual({
      count: 3,
      unit: 'cups',
    });
  });

  it('sends the response as the endpoint parses it, defaults included', async () => {
    const route = bound(COUNT, () => ({ count: 3 }));
    await expect(route.run(caller, RAW, testLogger())).resolves.toStrictEqual({
      count: 3,
      unit: 'items',
    });
  });

  it('refuses a response the endpoint does not describe', async () => {
    const route = bound(COUNT, () => ({ count: Number.NaN }));
    await expect(route.run(caller, RAW, testLogger())).rejects.toBeInstanceOf(ApiError);
    await expect(route.run(caller, RAW, testLogger())).rejects.toMatchObject({
      code: 'internal',
    });
  });
});

describe('a bound route served over HTTP', () => {
  it('hands the main thread the checked text while the worker does the check', async () => {
    const directory = await temporaryDirectory();
    const encoder = new ResponseEncoder(
      await bundledCodecWorker(directory.path),
      testLogger('responses'),
    );
    try {
      const fine = bound(API_ENDPOINTS.removeClient, () => ({ ok: true }) as const);
      const raw = { ...RAW, params: { clientId: '7f1c3a52-4b7e-4d0a-9c1e-2b8f6d5a4e31' } };
      await expect(fine.serve(caller, raw, encoder)).resolves.toStrictEqual({
        value: { ok: true },
        text: '{"ok":true}',
      });
      const broken = bound(API_ENDPOINTS.removeClient, () => {
        const reply: { ok: true } = { ok: true };
        Reflect.set(reply, 'ok', false);
        return reply;
      });
      await expect(broken.serve(caller, raw, encoder)).rejects.toMatchObject({
        code: 'internal',
        issueCodes: ['invalid_value'],
      });
    } finally {
      await encoder.close();
      await directory.remove();
    }
  });
});
