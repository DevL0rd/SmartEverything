import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import { HarnessHub } from '../src/process/http';
import type { HarnessBoot } from '../src/process/boot';

const BOOT: HarnessBoot = {
  type: 'harness_boot',
  protocol: 1,
  device_id: randomUUID(),
  generation: randomUUID(),
  runtime_instance: randomUUID(),
  name: 'test',
  hub_url: 'https://hub.test',
  token: 'secret',
  home_directory: '/home/test',
  state_directory: '/home/test/state',
  platform: 'linux',
  permission: { sandbox: 'danger-full-access', approval: 'never' },
};

function hubAnswering(response: Response): HarnessHub {
  return new HarnessHub(BOOT, { call: () => Promise.resolve(undefined) }, () =>
    Promise.resolve(response),
  );
}

describe('downloading bytes from the hub', () => {
  it('returns the body bytes of a successful answer', async () => {
    const bytes = await hubAnswering(new Response(new Uint8Array([1, 2, 3]))).download('/x');

    expect([...bytes]).toEqual([1, 2, 3]);
  });

  it('turns the hub error envelope into an api error', async () => {
    const body = JSON.stringify({ error: { code: 'forbidden', message: 'No access.' } });

    await expect(
      hubAnswering(
        new Response(body, { status: 403, headers: { 'content-type': 'application/json' } }),
      ).download('/x'),
    ).rejects.toMatchObject({ code: 'forbidden', message: 'No access.' });
  });

  it('reports a non-JSON error page as an upstream failure instead of a syntax error', async () => {
    const failure = hubAnswering(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    ).download('/x');

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ code: 'upstream_failed' });
  });
});
