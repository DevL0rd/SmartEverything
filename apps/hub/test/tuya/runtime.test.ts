import { afterEach, describe, expect, it } from 'vitest';
import { HOME_ID } from './recorded';
import { MESSAGING_TOPICS } from './fake-cloud';
import { NEW_KEY, waitFor, world, type World } from './world';

let current: World | null = null;

async function started(): Promise<World> {
  current = await world();
  return current;
}

afterEach(async () => {
  await current?.close();
  current = null;
});

function transportOf(w: World, deviceId: string): unknown {
  return w.sink.latest(deviceId)?.details['transport'];
}

function stateOf(w: World, deviceId: string, capability: string): unknown {
  return w.sink.states
    .filter((state) => state.externalId === deviceId && state.capability === capability)
    .at(-1)?.value;
}

async function onLan(w: World): Promise<void> {
  await w.announce('plug1', '127.0.0.1');
  await w.announce('gw1', '127.0.0.2');
  await w.announce('ir1', '127.0.0.3');
  await w.sink.until(() => transportOf(w, 'pir1') === 'local', 'the sub-device to go local');
  await w.sink.until(() => stateOf(w, 'plug1', 'power') === false, 'the plug state');
}

describe('Tuya transports', () => {
  it('starts every device on the cloud and says why', async () => {
    const w = await started();
    const devices = await w.adapter.discover();
    expect(
      devices.map((device) => [
        device.externalId,
        device.details['transport'],
        device.details['transportReason'],
      ]),
    ).toStrictEqual([
      ['plug1', 'cloud', 'not_on_lan'],
      ['gw1', 'cloud', 'not_on_lan'],
      ['pir1', 'cloud', 'gateway_not_on_lan'],
      ['th1', 'cloud', 'sleeping_sensor'],
      ['cz2', 'cloud', 'not_on_lan'],
      ['ir1', 'cloud', 'not_on_lan'],
      ['ir2', 'cloud', 'not_on_lan'],
    ]);
  });

  it('goes local for each device seen on the LAN and for sub-devices behind a local gateway', async () => {
    const w = await started();
    await onLan(w);
    expect(w.sink.latest('plug1')?.details).toMatchObject({
      transport: 'local',
      transportReason: 'on_lan',
      protocolVersion: '3.3',
    });
    expect(w.sink.latest('pir1')?.details).toMatchObject({
      transport: 'local',
      transportReason: 'via_gateway',
    });
    expect(transportOf(w, 'cz2')).toBe('cloud');
    expect(w.plug.connections).toBe(1);
  });

  it('ignores broadcasts from devices outside the account', async () => {
    const w = await started();
    const lists = w.sink.deviceLists.length;
    await w.announce('stranger', '127.0.0.9');
    await w.announce('plug1', '127.0.0.1');
    await w.sink.until(() => w.sink.deviceLists.length > lists, 'a device list');
    expect(w.sink.deviceLists.at(-1)?.some((device) => device.externalId === 'stranger')).toBe(
      false,
    );
  });
});

describe('local operation', () => {
  it('reads the initial state, scaled, as soon as the socket opens', async () => {
    const w = await started();
    await onLan(w);
    await w.sink.until(() => stateOf(w, 'plug1', 'power_draw') === 12.5, 'the power draw');
    expect(
      w.sink.events.some((event) => event.externalId === 'plug1' && event.kind === 'device_online'),
    ).toBe(true);
  });

  it('switches a plug over the LAN and reports the pushed state', async () => {
    const w = await started();
    await onLan(w);
    await expect(
      w.adapter.execute({
        commandId: '8b1e1c7e-0000-4000-8000-000000000001',
        externalId: 'plug1',
        capability: 'power',
        value: true,
      }),
    ).resolves.toBeNull();
    await w.sink.until(() => stateOf(w, 'plug1', 'power') === true, 'the switched state');
    expect(w.plug.controls).toStrictEqual([{ dps: { '1': true }, cid: null }]);
    expect(w.h.cloud.calls('POST', '/v1.1/m/thing/plug1/commands')).toStrictEqual([]);
  });

  it('reads and pushes sub-device state through the gateway with its node id', async () => {
    const w = await started();
    await onLan(w);
    await w.sink.until(() => stateOf(w, 'pir1', 'battery') === 80, 'the sub-device battery');
    expect(stateOf(w, 'pir1', 'motion')).toBe(false);
    w.gateway.push({ '1': 'pir' }, 'node-pir');
    await w.sink.until(() => stateOf(w, 'pir1', 'motion') === true, 'motion');
    expect(w.sink.events.filter((event) => event.kind === 'motion')).toMatchObject([
      { externalId: 'pir1', details: { code: 'pir', value: 'pir' } },
    ]);
  });

  it('refreshes local devices over the LAN and cloud devices through the cloud', async () => {
    const w = await started();
    await onLan(w);
    const updates = await w.adapter.refresh(['plug1', 'cz2', 'unknown']);
    expect(
      updates.map((update) => [update.externalId, update.capability, update.value]),
    ).toStrictEqual([
      ['plug1', 'power', false],
      ['plug1', 'power_draw', 12.5],
      ['cz2', 'power', true],
      ['cz2', 'power_draw', 3],
    ]);
  });

  it('reconnects after the device drops the socket', async () => {
    const w = await started();
    await onLan(w);
    const online = (): number =>
      w.sink.events.filter(
        (event) => event.externalId === 'plug1' && event.kind === 'device_online',
      ).length;
    expect(online()).toBe(1);
    w.plug.dropConnections();
    await w.sink.until(
      () =>
        w.sink.events.some(
          (event) => event.externalId === 'plug1' && event.kind === 'device_offline',
        ),
      'offline',
    );
    await w.sink.until(() => online() === 2, 'the reconnection');
  });

  it('fetches the new local key when the device stops understanding the old one', async () => {
    const w = await started();
    await onLan(w);
    const plugInCloud = w.h.cloud.devices.find((device) => device.id === 'plug1');
    if (plugInCloud === undefined) {
      throw new Error('the plug is missing from the fake cloud');
    }
    plugInCloud.local_key = NEW_KEY;
    w.plug.answerKey = NEW_KEY;
    w.plug.push({ '1': true });
    await waitFor(
      () => w.h.cloud.requests.some((request) => request.query.get('devIds') === 'plug1'),
      'the key refetch',
    );
    w.plug.key = NEW_KEY;
    await w.sink.until(
      () =>
        w.sink.events.filter(
          (event) => event.externalId === 'plug1' && event.kind === 'device_online',
        ).length === 2,
      'the reconnection with the new key',
    );
    w.plug.push({ '1': true });
    await w.sink.until(() => stateOf(w, 'plug1', 'power') === true, 'state under the new key');
    expect(transportOf(w, 'plug1')).toBe('local');
  });

  it('moves a device to the cloud when the cloud key is the one it refuses', async () => {
    const w = await started();
    await onLan(w);
    w.plug.answerKey = NEW_KEY;
    w.plug.push({ '1': true });
    await w.sink.until(() => transportOf(w, 'plug1') === 'cloud', 'the move to the cloud');
    expect(w.sink.latest('plug1')?.details['transportReason']).toBe('key_rejected');
    expect(w.sink.failures).toMatchObject([{ externalId: 'plug1', operation: 'local_key' }]);
    await waitFor(() => w.plug.connections === 0, 'the local socket to close');
  });
});

describe('cloud operation', () => {
  it('controls a device without a LAN path through the cloud', async () => {
    const w = await started();
    await w.adapter.execute({
      commandId: '8b1e1c7e-0000-4000-8000-000000000002',
      externalId: 'cz2',
      capability: 'power',
      value: false,
    });
    expect(w.h.cloud.commandsFor('cz2')).toStrictEqual([
      { commands: [{ code: 'switch_1', value: false }] },
    ]);
  });

  it('applies message service reports to cloud devices only', async () => {
    const w = await started();
    await onLan(w);
    const topic = MESSAGING_TOPICS.device;
    w.h.broker.publish(topic('th1', 'pen'), {
      protocol: 4,
      data: { devId: 'th1', status: [{ dpId: 1, value: 215 }] },
    });
    await w.sink.until(() => stateOf(w, 'th1', 'temperature') === 21.5, 'the cloud temperature');
    w.h.broker.publish(topic('plug1', 'pen'), {
      protocol: 4,
      data: { devId: 'plug1', status: [{ dpId: 1, value: true }] },
    });
    w.h.broker.publish(MESSAGING_TOPICS.owner(HOME_ID), {
      protocol: 20,
      data: { bizCode: 'offline', bizData: { devId: 'th1' } },
    });
    await w.sink.until(
      () =>
        w.sink.events.some(
          (event) => event.externalId === 'th1' && event.kind === 'device_offline',
        ),
      'offline',
    );
    expect(stateOf(w, 'plug1', 'power')).toBe(false);
  });

  it('connects to the message broker with the credentials the cloud gave and follows every device by the way it reports', async () => {
    const w = await started();
    const [connection] = w.h.broker.live;
    expect(connection?.options).toStrictEqual({
      url: 'ssl://broker.example.test:8883',
      clientId: 'client-0001',
      username: 'broker-user',
      password: 'broker-password',
    });
    expect([...(connection?.subscribed ?? [])].sort()).toStrictEqual(
      [
        MESSAGING_TOPICS.owner(HOME_ID),
        ...['plug1', 'pir1', 'th1', 'cz2', 'ir1'].map((id) => MESSAGING_TOPICS.device(id, 'pen')),
        ...['gw1', 'ir2'].map((id) => MESSAGING_TOPICS.device(id, 'sta')),
      ].sort(),
    );
  });

  it('skips a message it cannot read and reconnects when the broker drops', async () => {
    const w = await started();
    w.h.broker.publishRaw(MESSAGING_TOPICS.device('th1', 'pen'), '***');
    w.h.broker.drop();
    await waitFor(
      () => w.h.broker.connections.length === 2 && w.h.broker.live.length === 1,
      'the reconnection',
    );
    expect(w.sink.failures).toStrictEqual([]);
  });
});

describe('stopping', () => {
  it('closes every socket when unsubscribed', async () => {
    const w = await started();
    await onLan(w);
    await w.unsubscribe();
    await waitFor(
      () => w.plug.connections === 0 && w.gateway.connections === 0,
      'the local sockets to close',
    );
    await waitFor(() => w.h.broker.live.length === 0, 'the message broker to close');
  });
});
