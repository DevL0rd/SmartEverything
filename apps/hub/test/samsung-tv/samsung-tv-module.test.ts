import { createSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { CommandRefusedError, type ProviderAdapter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvDidNotWakeError } from '../../src/adapters/samsung-tv/adapter';
import { TvConnectionError, TvRefusedError } from '../../src/adapters/samsung-tv/connection';
import { createSamsungTvModule, samsungTvModule } from '../../src/adapters/samsung-tv/index';
import { FRESH_MS } from '../../src/adapters/samsung-tv/power-polling';
import { openTvSocket } from '../../src/adapters/samsung-tv/io';
import { udpSender } from '../../src/network/udp-sender';
import { TvLinkError } from '../../src/adapters/samsung-tv/link';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

const CREDENTIALS = {
  provider: 'samsung_tv',
  host: 'tv.test',
  macAddress: 'A1:B2:C3:D4:E5:F6',
  name: 'Living room TV',
} as const;

const ACCOUNT = {
  label: 'Living room TV',
  secrets: {
    host: 'tv.test',
    macAddress: 'A1:B2:C3:D4:E5:F6',
    name: 'Living room TV',
    model: 'QE65S95C',
    token: 'token-1',
    frame: false,
  },
};

const COMMAND = {
  commandId: '00000000-0000-4000-8000-000000000001',
  externalId: 'a1:b2:c3:d4:e5:f6',
};

let tv: FakeTv;
let record: ContextRecord;

beforeEach(async () => {
  tv = await FakeTv.start();
  record = contextFor('/nonexistent');
});

afterEach(async () => {
  vi.useRealTimers();
  Logger.reset();
  await tv.stop();
});

function remoteMessages(): unknown[] {
  return tv.messages.filter((message) => JSON.stringify(message).includes('ms.remote.control'));
}

async function subscribed(): Promise<
  { adapter: ProviderAdapter } & Awaited<ReturnType<typeof subscribe>>
> {
  const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
  return { adapter, ...(await subscribe(adapter)) };
}

describe('linking a Samsung TV', () => {
  it('asks the person to accept on the TV and keeps the token it issues', async () => {
    const account = await createSamsungTvModule(tv.io).link(CREDENTIALS, record.context);
    expect(account).toEqual(ACCOUNT);
    expect(tv.connections).toEqual([
      '/api/v2/channels/samsung.remote.control?name=U21hcnRFdmVyeXRoaW5n',
    ]);
    expect(record.prompts).toEqual([{ kind: 'accept_on_device', device: 'Living room TV' }]);
    await until(() => tv.openSockets === 0);
  });

  it('fails visibly when the person declines on the TV', async () => {
    tv.greeting = 'unauthorized';
    await expect(createSamsungTvModule(tv.io).link(CREDENTIALS, record.context)).rejects.toThrow(
      new TvRefusedError('tv.test', 'the request was declined on the TV or the token was rejected'),
    );
  });

  it('fails visibly when nobody answers the prompt on the TV', async () => {
    tv.greeting = 'time_out';
    await expect(createSamsungTvModule(tv.io).link(CREDENTIALS, record.context)).rejects.toThrow(
      'The Samsung TV at tv.test refused the remote control: nobody accepted the request on the TV in time.',
    );
  });

  it('refuses a connection that issued no token', async () => {
    tv.greeting = 'connect_without_token';
    await expect(createSamsungTvModule(tv.io).link(CREDENTIALS, record.context)).rejects.toThrow(
      new TvLinkError('tv.test', 'the TV accepted the connection but issued no token'),
    );
  });

  it('reports a TV that does not answer on its REST port', async () => {
    tv.power = 'off';
    await expect(createSamsungTvModule(tv.io).link(CREDENTIALS, record.context)).rejects.toThrow(
      new TvConnectionError(
        'tv.test',
        'the device information did not answer: TypeError: fetch failed',
      ),
    );
  });

  it('is built with the real network for production', () => {
    expect(samsungTvModule.provider).toBe('samsung_tv');
    const socket = openTvSocket(
      `ws://127.0.0.1:${String(tv.port)}/api/v2/channels/samsung.remote.control`,
    );
    socket.on('error', () => undefined);
    socket.terminate();
  });
});

describe('the Samsung TV adapter', () => {
  it('describes one television with its remote capabilities', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    const [device] = await adapter.discover();
    expect(device?.kind).toBe('television');
    expect(device?.capabilities.map((capability) => capability.key)).toEqual([
      'power',
      'raw:volume_up',
      'raw:volume_down',
      'raw:mute_toggle',
      'remote_key',
      'app_launch',
      'input_source',
    ]);
  });

  it('reports power, connects with the saved token and sends remote keys', async () => {
    const { adapter, states, stop } = await subscribed();
    await until(() => tv.openSockets === 1);
    expect(states.map((state) => [state.capability, state.value])).toEqual([['power', true]]);
    expect(tv.connections).toEqual([
      '/api/v2/channels/samsung.remote.control?name=U21hcnRFdmVyeXRoaW5n&token=token-1',
    ]);
    expect(record.logs.find((line) => line.event === 'power.polling_started')?.payload).toEqual({
      everyMs: 5000,
      reason: 'the TV pushes nothing about its power state while it is off',
    });
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_HOME' });
    await adapter.execute({ ...COMMAND, capability: 'raw:volume_up', value: null });
    await adapter.execute({ ...COMMAND, capability: 'input_source', value: 'hdmi2' });
    await until(() => remoteMessages().length === 3);
    expect(remoteMessages()).toEqual(
      ['KEY_HOME', 'KEY_VOLUP', 'KEY_HDMI2'].map((key) => ({
        method: 'ms.remote.control',
        params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
      })),
    );
    expect(tv.connections).toHaveLength(1);
    await stop();
  });

  it('launches an installed app by the id the TV knows it under', async () => {
    const { adapter, stop } = await subscribed();
    await adapter.execute({ ...COMMAND, capability: 'app_launch', value: 'YouTube' });
    await until(() => tv.messages.length === 2);
    expect(tv.messages[1]).toEqual({
      method: 'ms.channel.emit',
      params: {
        event: 'ed.apps.launch',
        to: 'host',
        data: { action_type: 'DEEP_LINK', appId: '111299001912', metaTag: '' },
      },
    });
    tv.installed = [{ appId: '11101200001', app_type: 4, name: 'Netflix' }];
    await adapter.execute({ ...COMMAND, capability: 'app_launch', value: 'Netflix' });
    await until(() => tv.messages.length === 4);
    expect(tv.messages[3]).toMatchObject({
      params: { data: { action_type: 'NATIVE_LAUNCH', appId: '11101200001' } },
    });
    await expect(
      adapter.execute({ ...COMMAND, capability: 'app_launch', value: 'Plex' }),
    ).rejects.toThrow(
      new CommandRefusedError('app_launch', 'Plex is not installed on the television'),
    );
    await stop();
  });

  it('turns the TV off with the power key and refuses keys while it is off', async () => {
    const { adapter, stop } = await subscribed();
    await adapter.execute({ ...COMMAND, capability: 'power', value: false });
    await until(() => remoteMessages().length === 1);
    expect(remoteMessages()[0]).toMatchObject({ params: { Cmd: 'Click', DataOfCmd: 'KEY_POWER' } });
    expect(tv.sleeps).toEqual([]);
    tv.power = 'standby';
    tv.clockMs += FRESH_MS;
    await expect(
      adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_HOME' }),
    ).rejects.toThrow(new CommandRefusedError('remote_key', 'the television is off'));
    await expect(
      adapter.execute({ ...COMMAND, capability: 'app_launch', value: 'YouTube' }),
    ).rejects.toThrow(new CommandRefusedError('app_launch', 'the television is off'));
    await adapter.execute({ ...COMMAND, capability: 'power', value: false });
    expect(remoteMessages()).toHaveLength(1);
    await stop();
  });

  it('sends remote keys from the last polled state without probing the TV again', async () => {
    const { adapter, stop } = await subscribed();
    await until(() => tv.openSockets === 1);
    const probes = tv.restRequests;
    for (let press = 0; press < 5; press += 1) {
      await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_VOLUP' });
    }
    expect(tv.restRequests).toBe(probes);
    tv.clockMs += FRESH_MS;
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_VOLUP' });
    expect(tv.restRequests).toBe(probes + 1);
    await stop();
  });

  it('wakes the TV with a magic packet and waits until it reports power', async () => {
    tv.power = 'off';
    const { adapter, states, stop } = await subscribed();
    await until(() => states.length === 1);
    await expect(
      adapter.execute({ ...COMMAND, capability: 'power', value: true }),
    ).resolves.toBeNull();
    expect(tv.sleeps).toEqual([1000]);
    expect([...(tv.packets[0] ?? [])].slice(0, 12)).toEqual([
      255, 255, 255, 255, 255, 255, 0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6,
    ]);
    expect(states.map((state) => state.value)).toEqual([false, true]);
    await adapter.execute({ ...COMMAND, capability: 'power', value: true });
    expect(tv.packets).toHaveLength(1);
    await stop();
  });

  it('says so when the TV does not wake up', async () => {
    tv.power = 'off';
    tv.wakesOnPacket = false;
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    await expect(adapter.execute({ ...COMMAND, capability: 'power', value: true })).rejects.toThrow(
      new TvDidNotWakeError('tv.test'),
    );
    expect(tv.packets).toHaveLength(1);
    expect(tv.sleeps).toEqual(Array.from({ length: 20 }, () => 1000));
  });

  it('follows the TV into standby and back, closing and reopening the socket', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { states, stop } = await subscribed();
    await until(() => tv.openSockets === 1);
    tv.power = 'standby';
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => tv.openSockets === 0);
    tv.power = 'on';
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => tv.openSockets === 1);
    expect(states.map((state) => state.value)).toEqual([true, false, true]);
    await stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(states).toHaveLength(3);
  });

  it('saves a token the TV rotates', async () => {
    tv.issuedToken = 'token-2';
    const { stop } = await subscribed();
    await until(() => record.saved.length === 1);
    expect(record.saved[0]).toEqual({
      label: 'Living room TV',
      secrets: { ...ACCOUNT.secrets, token: 'token-2' },
    });
    await stop();
  });

  it('asks for attention when the TV rejects the saved token', async () => {
    tv.greeting = 'unauthorized';
    const { stop } = await subscribed();
    await until(() => record.attention.length === 1);
    expect(record.attention).toEqual([
      'The Samsung TV at tv.test refused the remote control: the request was declined on the TV or the token was rejected.',
    ]);
    expect(record.logs.map((line) => line.event)).toContain('remote.connect_failed');
    await stop();
  });

  it('logs messages from the TV that it cannot read, and keeps the connection', async () => {
    const { adapter, stop } = await subscribed();
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_INFO' });
    tv.send('not json');
    await until(() => record.logs.some((line) => line.event === 'remote.problem'));
    expect(tv.openSockets).toBe(1);
    await stop();
  });

  it('reads the power state on refresh, and only for its own device', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    expect(await adapter.refresh(['a1:b2:c3:d4:e5:f6'])).toEqual([
      {
        externalId: 'a1:b2:c3:d4:e5:f6',
        capability: 'power',
        value: true,
        observedAt: '2026-10-08T12:00:00.000Z',
      },
    ]);
    expect(await adapter.refresh(['other'])).toEqual([]);
  });

  it('refuses capabilities the television does not have', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    await expect(
      adapter.execute({ ...COMMAND, capability: 'brightness', value: 3 }),
    ).rejects.toThrow(new CommandRefusedError('brightness', 'the television does not have it'));
  });
});

describe('the Wake-on-LAN sender', () => {
  it('sends the packet over UDP to the given address and port', async () => {
    const receiver = createSocket('udp4');
    await new Promise<void>((resolve) => {
      receiver.bind(0, '127.0.0.1', resolve);
    });
    const received = new Promise<Buffer>((resolve) => {
      receiver.once('message', resolve);
    });
    const { port } = receiver.address() satisfies AddressInfo;
    await udpSender('127.0.0.1', port)(Uint8Array.from([1, 2, 3]));
    expect([...(await received)]).toEqual([1, 2, 3]);
    receiver.close();
  });

  it('reports a packet that could not be sent', async () => {
    await expect(udpSender('256.0.0.1', 9)(Uint8Array.from([1]))).rejects.toThrow();
  });
});
