import type { DiscoveredDevice } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { XiaomiAccountError, XiaomiSessionRejectedError } from '../../src/adapters/xiaomi/account';
import { XiaomiHttpError } from '../../src/adapters/xiaomi/cloud-api';
import { createXiaomiModule } from '../../src/adapters/xiaomi/module';
import { dependencies, routedFetch, waitFor } from './harness';
import { createWorld, destroyWorld, startAdapter, subscribe, type World } from './world';

let world: World;

beforeEach(async () => {
  world = await createWorld();
});

afterEach(async () => {
  await destroyWorld(world);
});

function valuesOf(
  states: readonly { capability: string; value: unknown; externalId: string }[],
): string[] {
  return states.map(
    (state) => `${state.externalId}/${state.capability}=${JSON.stringify(state.value)}`,
  );
}

describe('running Xiaomi devices', () => {
  it('polls LAN and cloud devices and reports only values that changed', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await adapter.refresh(['100001', 'lumi.158d0001']);
    const recorded = await subscribe(world, adapter);
    world.purifier.properties.set('3.4', 30);
    world.cloud.cloudProperties.set('lumi.158d0001/2.1', true);
    await waitFor(() => {
      const values = valuesOf(recorded.states);
      return values.includes('100001/pm25=30') && values.includes('lumi.158d0001/motion=true');
    });
    expect(valuesOf(recorded.states)).not.toContain('100001/power=true');
  });

  it('turns a call button press and the camera event list into device events', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    await adapter.refresh(['100003']);
    world.cloud.cameraUnits.push({
      createTime: Date.now() - 60_000,
      eventType: 'ObjectMotion',
      fileId: 'old',
    });
    const recorded = await subscribe(world, adapter);
    world.cloud.cloudProperties.set('100003/30.2', 1);
    world.cloud.cameraUnits.push({
      createTime: Date.now(),
      eventType: 'PeopleMotion:ObjectMotion:Mystery',
      fileId: 'f1',
    });
    await waitFor(() => recorded.events.length >= 4);
    expect(recorded.events.find((event) => event.kind === 'call')).toMatchObject({
      externalId: '100003',
      details: { miotEvent: 'key-call-start', source: 'key-call-status' },
    });
    const listed = recorded.events.filter(
      (event) => event.details['source'] === 'camera-event-list',
    );
    expect(listed.map((event) => [event.kind, event.details['fileId']])).toStrictEqual([
      ['person', 'f1'],
      ['motion', 'f1'],
      ['activity', 'f1'],
    ]);
    expect(listed.find((event) => event.kind === 'activity')?.details).toMatchObject({
      eventType: 'PeopleMotion:ObjectMotion:Mystery',
      event: 'Mystery',
      summary: 'Mystery',
      hasClip: true,
    });
  });

  it('renews an expired cloud session with the passToken and saves the new session', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    world.cloud.expireNext = 1;
    const states = await adapter.refresh(['lumi.158d0001']);
    expect(valuesOf(states)).toContain('lumi.158d0001/motion=false');
    expect(world.harness.saved).toHaveLength(1);
    expect(world.harness.saved[0]?.secrets).toMatchObject({
      passToken: 'V1:pass-0',
      serviceToken: 'service-1',
    });
    world.account.serviceToken = 'rotated-elsewhere';
    await expect(adapter.refresh(['lumi.158d0001'])).resolves.toHaveLength(2);
    expect(world.harness.saved).toHaveLength(2);
    expect(world.harness.attention).toStrictEqual([]);
  });

  it('asks the person to link again when Xiaomi rejects the passToken', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    world.account.passTokens.clear();
    world.cloud.expireNext = 1;
    await expect(adapter.refresh(['lumi.158d0001'])).resolves.toStrictEqual([]);
    expect(world.harness.attention).toStrictEqual([
      'Xiaomi no longer accepts the stored passToken; the account has to be linked again.',
    ]);
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100003',
        capability: 'power',
        value: false,
      }),
    ).rejects.toThrow(XiaomiSessionRejectedError);
  });

  it('moves a device to the cloud when its LAN stops answering and says so', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    world.cloud.cloudProperties.set('100001/2.1', false);
    const recorded = await subscribe(world, adapter);
    world.purifier.silent = true;
    const purifierOf = (): DiscoveredDevice | undefined =>
      recorded.devices.at(-1)?.find((device) => device.externalId === '100001');
    await waitFor(() => purifierOf()?.details['transport'] === 'cloud', 5000);
    const purifier = purifierOf();
    expect(purifier?.details['updates']).toEqual(
      expect.stringMatching(/^cloud-poll every 0\.12 s: /),
    );
    expect(purifier?.details['transportReason']).toEqual(
      expect.stringMatching(
        /^the LAN stopped answering after 2 polls: The device at 127\.0\.0\.2 did not answer the miIO handshake/,
      ),
    );
    expect(recorded.failures.filter((failure) => failure.operation === 'lan-poll')).toHaveLength(2);
    await waitFor(() => valuesOf(recorded.states).includes('100001/power=false'));
  });

  it('stops every loop when the subscription ends', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await waitFor(() => world.purifier.requests.length > 0);
    await world.unsubscribers.splice(0)[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const settled = world.purifier.requests.length;
    const calls = world.cloud.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(world.purifier.requests.length).toBe(settled);
    expect(world.cloud.calls.length).toBe(calls);
    expect(recorded.failures).toStrictEqual([]);
  });

  it('keeps polling the new inventory after a rediscovery', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await adapter.discover();
    world.purifier.properties.set('4.1', 55);
    await waitFor(() => valuesOf(recorded.states).includes('100001/filter_life=55'));
    expect(world.purifier.handshakes).toBeGreaterThan(1);
  });

  it('names a failing cloud HTTP status', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    world.cloud.failStatus = 503;
    await expect(
      adapter.execute({
        commandId: crypto.randomUUID(),
        externalId: '100003',
        capability: 'power',
        value: false,
      }),
    ).rejects.toThrow(new XiaomiHttpError('/miotspec/prop/set', 503));
  });

  it('refuses to start from a stored account without the session secrets', async () => {
    const module = createXiaomiModule(dependencies(routedFetch([]), world.port), null);
    await expect(
      module.start(
        { label: 'broken', secrets: { userId: '1', region: 'mars' } },
        world.harness.context,
      ),
    ).rejects.toThrow(
      new XiaomiAccountError('passToken, ssecurity, serviceToken, deviceId, region'),
    );
  });
});
