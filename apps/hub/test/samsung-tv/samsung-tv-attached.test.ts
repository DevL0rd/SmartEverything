import { CommandRefusedError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSamsungTvModule } from '../../src/adapters/samsung-tv/index';
import { directLinksOf, withTelevision } from '../../src/adapters/samsung-tv/link';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

const SMARTTHINGS_TV = '11111111-1111-4111-8111-111111111111';

const OTHER_TV = '22222222-2222-4222-8222-222222222222';

const CREDENTIALS = { provider: 'samsung_tv', host: 'tv.test', attachTo: SMARTTHINGS_TV } as const;

const TELEVISION = {
  host: 'tv.test',
  macAddress: 'a1:b2:c3:d4:e5:f6',
  name: 'Living room TV',
  model: 'QE65S95C',
  token: 'token-1',
  frame: false,
  attachedTo: SMARTTHINGS_TV,
};

const ACCOUNT = { label: 'Living room TV', secrets: { televisions: [TELEVISION] } };

const COMMAND = {
  commandId: '00000000-0000-4000-8000-000000000001',
  externalId: SMARTTHINGS_TV,
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

describe('linking a screen directly from its SmartThings device', () => {
  it('learns the address and the wake address from the screen and keeps which device it is', async () => {
    const account = await createSamsungTvModule(tv.io).link(CREDENTIALS, record.context);
    expect(account).toEqual(ACCOUNT);
    expect(directLinksOf(account)).toEqual([
      { deviceId: SMARTTHINGS_TV, host: 'tv.test', macAddress: 'a1:b2:c3:d4:e5:f6' },
    ]);
    expect(record.prompts).toEqual([{ kind: 'accept_on_device', device: 'Living room TV' }]);
    await until(() => tv.openSockets === 0);
  });

  it('reads no direct links from an absent account or a screen added by address', () => {
    const { attachedTo, ...plain } = TELEVISION;
    expect(attachedTo).toBe(SMARTTHINGS_TV);
    expect(directLinksOf({ ...ACCOUNT, secrets: { televisions: [plain] } })).toEqual([]);
    expect(directLinksOf(undefined)).toEqual([]);
    expect(directLinksOf(null)).toEqual([]);
  });
});

describe('one screen is one device', () => {
  const kitchen = {
    ...TELEVISION,
    host: 'kitchen.test',
    macAddress: '10:20:30:40:50:60',
    attachedTo: OTHER_TV,
  };

  it('replaces the entry of a screen that is linked again', () => {
    const moved = { ...TELEVISION, host: 'tv-new.test', token: 'token-2' };
    expect(withTelevision([kitchen, TELEVISION], moved)).toEqual([kitchen, moved]);
  });

  it('moves the link of a device to the screen picked for it', () => {
    const picked = { ...kitchen, attachedTo: SMARTTHINGS_TV };
    expect(withTelevision([TELEVISION, kitchen], picked)).toEqual([picked]);
  });

  it('keeps a linked screen on its device when it is added again by address', () => {
    const { attachedTo, ...byAddress } = TELEVISION;
    expect(attachedTo).toBe(SMARTTHINGS_TV);
    expect(withTelevision([TELEVISION], { ...byAddress, token: 'token-2' })).toEqual([
      { ...TELEVISION, token: 'token-2' },
    ]);
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

  it('sends a key to the screen of the device after one look at it and pushes no state', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    const { states, stop } = await subscribe(adapter);
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_VOLUP' });
    await until(() => tv.messages.length === 1);
    expect(tv.restRequests).toBe(1);
    expect(tv.messages[0]).toMatchObject({ params: { DataOfCmd: 'KEY_VOLUP' } });
    expect(states).toEqual([]);
    await stop();
  });

  it('refuses a command for a device that has no direct link', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
    await expect(
      adapter.execute({ ...COMMAND, externalId: OTHER_TV, capability: 'power', value: true }),
    ).rejects.toThrow(new CommandRefusedError('power', 'the screen is not linked directly'));
    expect(tv.restRequests).toBe(0);
  });

  it('wakes a sleeping television with the magic packet of the address it learned', async () => {
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
    const framed = { ...ACCOUNT, secrets: { televisions: [{ ...TELEVISION, frame: true }] } };
    const adapter = await createSamsungTvModule(tv.io).start(framed, record.context);
    const { stop } = await subscribe(adapter);
    await adapter.execute({ ...COMMAND, capability: 'remote_key', value: 'KEY_HOME' });
    await until(() => tv.messages.length === 1);
    expect(tv.openArtSockets).toBe(0);
    expect(tv.connections.some((url) => url.includes('art-app'))).toBe(false);
    await stop();
  });
});
