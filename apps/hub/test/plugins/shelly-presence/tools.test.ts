import { describe, expect, it, vi } from 'vitest';
import type { ToolCaller } from '../../../src/ai-tools/hub-tool';
import {
  shellyTools,
  type ShellyToolPorts,
} from '../../../src/plugins/builtin/shelly-presence/tools';
import { sensorFixture } from './sensor-fixture';

function caller(overrides: Partial<ToolCaller> = {}): ToolCaller {
  return {
    profileId: 'person-1',
    role: 'owner',
    chatId: null,
    via: 'app',
    clientId: 'client-1',
    ...overrides,
  };
}

function ports(): ShellyToolPorts {
  const sensor = sensorFixture();
  return {
    signal: new AbortController().signal,
    snapshot: () => ({ at: '2026-10-17T10:00:00.000Z', devices: [sensor] }),
    read: vi.fn(() => Promise.resolve(sensor)),
    execute: vi.fn<ShellyToolPorts['execute']>((_, request) =>
      Promise.resolve({
        state: 'accepted' as const,
        action: request.action,
        result: null,
        restartRequired: false,
        revision: 5,
      }),
    ),
    enroll: vi.fn(() => Promise.resolve(sensor)),
    forget: vi.fn(() => Promise.resolve()),
    track: vi.fn(() => Promise.resolve({ enabled: true })),
  };
}

async function run(
  tools: ReturnType<typeof shellyTools>,
  name: string,
  input: Record<string, unknown>,
  who: ToolCaller = caller(),
): Promise<Readonly<Record<string, unknown>>> {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return (await tool.run(input, who)).response;
}

const SENSOR = sensorFixture().externalId;

describe('Shelly tools', () => {
  it('offers one operate tool next to read, live tracking and setup', () => {
    expect(shellyTools(ports()).map((tool) => tool.name)).toEqual([
      'read',
      'operate',
      'set_live_view',
      'discover',
      'enroll',
      'forget',
    ]);
  });

  it('lets a member read and make everyday changes but keeps the rest with the owner', async () => {
    const shelly = ports();
    const tools = shellyTools(shelly);
    const member = caller({ role: 'member' });
    const everyday = { externalId: SENSOR, action: 'set_detection', params: { enable: true } };
    expect(await run(tools, 'operate', everyday, member)).toMatchObject({ state: 'accepted' });
    const restart = { externalId: SENSOR, action: 'device_reboot', params: {} };
    expect(await run(tools, 'operate', restart, member)).toHaveProperty('error');
    expect(shelly.execute).toHaveBeenCalledTimes(1);
    expect(await run(tools, 'operate', restart)).toMatchObject({ state: 'accepted' });
  });

  it('lets the owner change the device password from a chat', async () => {
    const tools = shellyTools(ports());
    const request = { externalId: SENSOR, action: 'device_password', params: { password: 'x' } };
    const chat = caller({ via: 'chat', chatId: 'chat-1', clientId: null });
    expect(await run(tools, 'operate', request, chat)).toMatchObject({ state: 'accepted' });
  });

  it('keeps device schedules, webhooks, scripts and stored values with the owner', async () => {
    const tools = shellyTools(ports());
    const member = caller({ role: 'member' });
    for (const resource of ['schedules', 'webhooks', 'scripts', 'storedValues'])
      expect(await run(tools, 'read', { externalId: SENSOR, resource }, member)).toHaveProperty(
        'error',
      );
    for (const resource of ['schedules', 'webhooks'])
      expect(await run(tools, 'read', { externalId: SENSOR, resource })).toHaveProperty('device');
    expect(await run(tools, 'read', { externalId: SENSOR }, member)).toHaveProperty('snapshot');
  });

  it('describes the operations and the exact parameters of one of them', async () => {
    const tools = shellyTools(ports());
    const listed = await run(tools, 'read', { resource: 'actions' });
    expect(JSON.stringify(listed)).toContain('"action":"set_zone"');
    const detail = await run(tools, 'read', { resource: 'actions', action: 'set_zone' });
    expect(detail).toMatchObject({
      action: 'set_zone',
      method: 'PresenceZone.SetConfig',
      owner: false,
    });
    expect(JSON.stringify(detail['params'])).toContain('"id"');
  });

  it('rejects a revision on an operation that has no list', async () => {
    const tools = shellyTools(ports());
    const request = {
      externalId: SENSOR,
      action: 'set_detection',
      params: { enable: true },
      expectedRevision: 3,
    };
    expect(await run(tools, 'operate', request)).toHaveProperty('error');
  });

  it('tracks for callers without a paired client and separates their holders', async () => {
    const shelly = ports();
    const tools = shellyTools(shelly);
    const phone = caller();
    const automation = caller({ via: 'automation', clientId: null, profileId: 'person-2' });
    await run(tools, 'set_live_view', { externalId: SENSOR, enabled: true }, phone);
    await run(tools, 'set_live_view', { externalId: SENSOR, enabled: true }, automation);
    const holders = vi.mocked(shelly.track).mock.calls.map((call) => call[1]);
    expect(new Set(holders).size).toBe(2);
  });

  it('keeps two automations of one person apart when each names its holder', async () => {
    const shelly = ports();
    const tools = shellyTools(shelly);
    const automation = caller({ via: 'automation', clientId: null });
    for (const holder of ['porch', 'hall'])
      await run(tools, 'set_live_view', { externalId: SENSOR, enabled: true, holder }, automation);
    await run(
      tools,
      'set_live_view',
      { externalId: SENSOR, enabled: false, holder: 'porch' },
      automation,
    );
    const holders = vi.mocked(shelly.track).mock.calls.map((call) => call[1]);
    expect(holders[0]).not.toBe(holders[1]);
    expect(holders[2]).toBe(holders[0]);
  });

  it('keeps adding and removing sensors with the owner and adding human only', async () => {
    const shelly = ports();
    const tools = shellyTools(shelly);
    const member = caller({ role: 'member' });
    expect(await run(tools, 'enroll', { address: 'http://192.0.2.7' }, member)).toHaveProperty(
      'error',
    );
    expect(await run(tools, 'forget', { externalId: SENSOR }, member)).toHaveProperty('error');
    expect(await run(tools, 'forget', { externalId: SENSOR })).toEqual({ removed: true });
    expect(tools.find((tool) => tool.name === 'enroll')?.humanOnly).toBe(true);
    expect(shelly.enroll).not.toHaveBeenCalled();
  });
});
