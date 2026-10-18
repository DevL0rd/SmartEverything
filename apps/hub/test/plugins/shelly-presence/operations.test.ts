import { shellyPasswordHash } from '@smarteverything/shelly/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DEVICE_ID, memoryRecords, until, type RpcHandler } from './fake-shelly';
import { closeHarnesses, harness } from './harness';

afterEach(closeHarnesses);

const WRITE = z.object({ offset: z.number(), data: z.string() });

describe('Shelly operations', () => {
  it('sends the catalogue method and confirms with a fresh inventory read', async () => {
    const { session, shelly } = await harness();
    const reads = (): number => shelly.calls.filter((c) => c.method === 'Shelly.GetStatus').length;
    const before = reads();
    const outcome = await session.execute({
      action: 'set_presence',
      params: { config: { enable: false } },
    });
    expect(shelly.calls.find((call) => call.method === 'Presence.SetConfig')?.params).toEqual({
      config: { enable: false },
    });
    expect(outcome).toMatchObject({ state: 'accepted', confirmed: true, restartRequired: false });
    expect(reads()).toBe(before + 1);
  });

  it('reports a restart the device asks for', async () => {
    const { session } = await harness({
      handler: (method) =>
        method === 'Presence.SetConfig' ? { restart_required: true } : undefined,
    });
    const outcome = await session.execute({
      action: 'set_presence',
      params: { config: { enable: true } },
    });
    expect(outcome).toMatchObject({ state: 'accepted', restartRequired: true });
  });

  it('answers with the device refusal and no inventory read', async () => {
    const { session } = await harness({
      handler: (method) =>
        method === 'Presence.SetConfig'
          ? { error: { code: -103, message: 'Invalid argument' } }
          : undefined,
    });
    await expect(
      session.execute({ action: 'set_presence', params: { config: { enable: true } } }),
    ).rejects.toThrow('Invalid argument');
  });

  it('refuses parameters the catalogue does not describe before calling the device', async () => {
    const { session, shelly } = await harness();
    const before = shelly.calls.length;
    await expect(
      session.execute({ action: 'set_zone', params: { id: 'x', config: {} } }),
    ).rejects.toThrow();
    expect(shelly.calls.length).toBe(before);
  });

  it('reads the device log over HTTP without touching the inventory', async () => {
    const { session, shelly } = await harness({
      http: (request, response): boolean => {
        if (request.url?.startsWith('/debug/log') !== true) return false;
        response.end('first line\nsecond line');
        return true;
      },
    });
    const before = shelly.calls.length;
    const outcome = await session.execute({ action: 'device_logs', params: { lines: 5 } });
    expect(outcome).toMatchObject({
      state: 'accepted',
      result: { text: 'first line\nsecond line' },
    });
    expect(outcome).not.toHaveProperty('confirmed');
    expect(shelly.calls.length).toBe(before);
  });
});

const SCHEDULES: RpcHandler = (method) =>
  method === 'Schedule.List'
    ? {
        jobs: [
          {
            id: 1,
            enable: true,
            timespec: '0 0 * * * *',
            calls: [
              { method: 'MQTT.SetConfig', params: { config: { pass: 'secret' } } },
              { method: 'Shelly.Reboot' },
            ],
          },
        ],
        rev: 4,
      }
    : undefined;

describe('Shelly lists that other people can edit', () => {
  it('shows the schedule calls as the sensor reports them and saves them back whole', async () => {
    const { session, shelly } = await harness({ handler: SCHEDULES });
    const shown = await session.readResource('schedules');
    expect(shown.resources?.schedules?.jobs[0]?.calls).toHaveLength(2);
    expect(JSON.stringify(shown.resources?.schedules)).toContain('secret');
    const calls = [{ method: 'MQTT.SetConfig', params: { config: { pass: 'secret' } } }];
    await session.execute({ action: 'schedule_update', params: { id: 1, schedule: { calls } } });
    expect(shelly.calls.find((call) => call.method === 'Schedule.Update')?.params).toEqual({
      id: 1,
      calls,
    });
  });

  it('writes a list only when the revision still matches', async () => {
    const { session, shelly } = await harness({ handler: SCHEDULES });
    const edit = { id: 1, schedule: { enable: false } };
    await expect(
      session.execute({ action: 'schedule_update', params: edit, expectedRevision: 3 }),
    ).rejects.toThrow('list changed');
    expect(shelly.calls.some((call) => call.method === 'Schedule.Update')).toBe(false);
    await session.execute({ action: 'schedule_update', params: edit, expectedRevision: 4 });
    expect(shelly.calls.find((call) => call.method === 'Schedule.Update')?.params).toEqual({
      id: 1,
      enable: false,
    });
  });

  it('shows webhook destinations with their query strings and saves new ones', async () => {
    const url = 'http://192.0.2.9/hook?state=on&token=1';
    const { session, shelly } = await harness({
      handler: (method) => {
        if (method === 'Webhook.ListAllSupported') return { types: [] };
        return method === 'Webhook.List'
          ? { hooks: [{ id: 1, event: 'presence.enter', cid: 200, urls: [url] }], rev: 2 }
          : undefined;
      },
    });
    const shown = await session.readResource('webhooks');
    expect(shown.resources?.webhooks?.hooks[0]?.urls).toEqual([url]);
    const next = 'http://192.0.2.10/hook?state=off';
    const changed = await session.execute({
      action: 'webhook_update',
      params: { id: 1, webhook: { urls: [next] } },
    });
    expect(changed.state).toBe('accepted');
    expect(shelly.calls.find((call) => call.method === 'Webhook.Update')?.params).toMatchObject({
      id: 1,
      urls: [next],
    });
  });

  it('reads the list before a write only when a revision is given', async () => {
    const { session, shelly } = await harness({ handler: SCHEDULES });
    await session.execute({
      action: 'schedule_update',
      params: { id: 1, schedule: { enable: false } },
    });
    const before = shelly.calls.map((call) => call.method);
    expect(before.indexOf('Schedule.List')).toBeGreaterThan(before.indexOf('Schedule.Update'));
  });
});

describe('Shelly transfers and access', () => {
  it('writes a firmware file in 2 KiB steps and checks every offset the device returns', async () => {
    const offsets: number[] = [];
    const { session } = await harness({
      handler: (method, params) => {
        if (method !== 'OTA.Write') return undefined;
        const write = WRITE.parse(params);
        offsets.push(write.offset);
        return { offset: write.offset + Buffer.from(write.data, 'base64').length };
      },
    });
    const outcome = await session.execute({
      action: 'firmware_upload_write',
      params: { offset: 0, data: Buffer.alloc(5000, 7).toString('base64') },
    });
    expect(offsets).toEqual([0, 2048, 4096]);
    expect(outcome).toMatchObject({ state: 'accepted', result: { offset: 5000 } });
  });

  it('stops a firmware upload when the device moves to another offset', async () => {
    const { session } = await harness({
      handler: (method) => (method === 'OTA.Write' ? { offset: 1 } : undefined),
    });
    await expect(
      session.execute({
        action: 'firmware_upload_write',
        params: { offset: 0, data: Buffer.alloc(100).toString('base64') },
      }),
    ).rejects.toThrow('firmware offset');
  });

  it('changes the device login with the hash of the new password and keeps it', async () => {
    const setPassword = vi.fn((password: string | null) => Promise.resolve(password));
    const { session, shelly } = await harness({ setPassword });
    await session.execute({ action: 'device_password', params: { password: 'new-pass' } });
    expect(shelly.calls.find((call) => call.method === 'Shelly.SetAuth')?.params).toEqual({
      user: 'admin',
      realm: DEVICE_ID,
      ha1: shellyPasswordHash(DEVICE_ID, 'new-pass'),
    });
    expect(setPassword).toHaveBeenCalledWith('new-pass');
  });

  it('re-reads the inventory once more when the configuration changes during a read', async () => {
    let reads = 0;
    const { session } = await harness({
      rpc:
        (shelly) =>
        (method): undefined => {
          if (method !== 'Shelly.GetStatus') return undefined;
          reads += 1;
          if (reads === 1)
            shelly.notify('NotifyEvent', {
              events: [{ component: 'sys', event: 'config_changed', ts: 5 }],
            });
          return undefined;
        },
    });
    await until(() => reads === 2, 'the second inventory read');
    expect(session.current().connection.state).toBe('online');
  });

  it('starts from a blank sensor when the remembered snapshot has an older shape', async () => {
    const snapshots = memoryRecords();
    snapshots.put(DEVICE_ID, { id: DEVICE_ID, features: [{ id: 'x', focus: 'zones' }] });
    const { session } = await harness({ snapshots });
    expect(session.current().features.some((feature) => feature.id === 'x')).toBe(false);
  });
});
