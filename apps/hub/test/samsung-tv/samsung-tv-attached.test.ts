import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSamsungTvModule } from '../../src/adapters/samsung-tv/index';
import { attachedDeviceOf } from '../../src/adapters/samsung-tv/link';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

const SMARTTHINGS_TV = '11111111-1111-4111-8111-111111111111';

const CREDENTIALS = {
  provider: 'samsung_tv',
  host: 'tv.test',
  macAddress: 'A1:B2:C3:D4:E5:F6',
  name: 'Living room TV',
  attachTo: SMARTTHINGS_TV,
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
    attachedTo: SMARTTHINGS_TV,
  },
};

const PLAIN_SECRETS = {
  host: 'tv.test',
  macAddress: 'A1:B2:C3:D4:E5:F6',
  name: 'Living room TV',
  model: 'QE65S95C',
  token: 'token-1',
  frame: false,
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
  Logger.reset();
  await tv.stop();
});

describe('linking a direct connection to a SmartThings television', () => {
  it('keeps which television it is attached to', async () => {
    const account = await createSamsungTvModule(tv.io).link(CREDENTIALS, record.context);
    expect(account).toEqual(ACCOUNT);
    await until(() => tv.openSockets === 0);
  });

  it('reads the attached television from a stored account', () => {
    expect(attachedDeviceOf(ACCOUNT)).toBe(SMARTTHINGS_TV);
    expect(attachedDeviceOf({ ...ACCOUNT, secrets: PLAIN_SECRETS })).toBeNull();
    expect(attachedDeviceOf(undefined)).toBeNull();
  });
});

describe('an attached direct connection', () => {
  it('adds no device and reports no state of its own', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    expect(await adapter.discover()).toEqual([]);
    expect(await adapter.refresh(['a1:b2:c3:d4:e5:f6'])).toEqual([]);
    expect(tv.restRequests).toBe(0);
  });

  it('does not poll the television when it starts', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    const { states, stop } = await subscribe(adapter);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 30);
    });
    expect(tv.restRequests).toBe(0);
    expect(tv.connections).toEqual([]);
    expect(states).toEqual([]);
    expect(record.logs.map((line) => line.event)).not.toContain('power.polling_started');
    await stop();
  });

  it('sends a key after one look at the television and pushes no state', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    const { states, stop } = await subscribe(adapter);
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_VOLUP' });
    await until(() => tv.messages.length === 1);
    expect(tv.restRequests).toBe(1);
    expect(tv.messages[0]).toMatchObject({ params: { DataOfCmd: 'KEY_VOLUP' } });
    expect(states).toEqual([]);
    await stop();
  });

  it('wakes a sleeping television with a magic packet', async () => {
    tv.power = 'off';
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    const { states, stop } = await subscribe(adapter);
    await expect(
      adapter.execute({ ...COMMAND, capability: 'power', value: true }),
    ).resolves.toBeNull();
    expect([...(tv.packets[0] ?? [])].slice(6, 12)).toEqual([0xa1, 0xb2, 0xc3, 0xd4, 0xe5, 0xf6]);
    expect(states).toEqual([]);
    await stop();
  });

  it('leaves the art channel of a Frame television to SmartThings', async () => {
    tv.frameSupport = 'true';
    const framed = { ...ACCOUNT, secrets: { ...ACCOUNT.secrets, frame: true } };
    const adapter = await createSamsungTvModule(tv.io).start(framed, record.context);
    const { stop } = await subscribe(adapter);
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_HOME' });
    await until(() => tv.messages.length === 1);
    expect(tv.openArtSockets).toBe(0);
    expect(tv.connections.some((url) => url.includes('art-app'))).toBe(false);
    await stop();
  });
});
