import { describe, expect, it, vi } from 'vitest';
import { NodeAiRuntime } from '../../src/node/ai-runtime';
import { NodeLogShip } from '../../src/node/log-ship';
import { testLogger } from '../support/logs';
import { guestMember, useComputerHub } from '../support/paired-computer';
import { call } from '../support/server';

describe('paired computer runtime logs', () => {
  const hub = useComputerHub();

  it('attributes a shipped log to the authenticated computer and exposes it only to the owner', async () => {
    const paired = await hub.pair();
    const booted = hub.booted();
    const logs = new NodeLogShip();
    const runtime = new NodeAiRuntime({
      hubUrl: booted.base,
      token: paired.token,
      deviceId: paired.deviceId,
      hello: paired.hello,
      log: testLogger('node'),
      logs,
      createComputer: (): null => null,
      createRuntimeHosts: (): Promise<[]> => Promise.resolve([]),
      changed: (): void => undefined,
    });
    logs.record({
      timestamp: '2026-11-05T07:00:00.000Z',
      runtime: 'app',
      platform: 'web',
      scope: 'hub.node',
      event: 'sample.failed',
      level: 'error',
      deviceId: 'forged-device',
      payload: { password: 'unshippable-secret' },
    });
    runtime.start();
    const path = `/api/runtime-logs?source=node%3A${paired.deviceId}`;
    try {
      await vi.waitFor(async () => {
        const read = await call(booted.base, booted.owner, { method: 'GET', path });
        expect(read.status).toBe(200);
        expect(read.body).toMatchObject({
          rows: [
            {
              deviceId: paired.deviceId,
              source: `node:${paired.deviceId}`,
              event: 'sample.failed',
              runtime: 'hub',
              platform: 'server',
            },
          ],
        });
        expect(JSON.stringify(read.body)).not.toMatch(/unshippable-secret|forged-device/u);
      });
      const member = await guestMember(booted);
      const hidden = await call(booted.base, member, { method: 'GET', path });
      expect(hidden.status).toBe(200);
      expect(hidden.body).toMatchObject({ rows: [] });
    } finally {
      runtime.stop();
    }
  });
});
