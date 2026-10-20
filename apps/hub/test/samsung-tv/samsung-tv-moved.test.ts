import type { ProviderAdapter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSamsungTvModule } from '../../src/adapters/samsung-tv/index';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

const TELEVISION = {
  host: 'tv.test',
  macAddress: 'a1:b2:c3:d4:e5:f6',
  name: 'Living room TV',
  model: 'QE65S95C',
  token: 'token-1',
  frame: false,
};

const UNREACHABLE = {
  ...TELEVISION,
  host: 'kitchen.test',
  macAddress: '10:20:30:40:50:60',
  name: 'Kitchen TV',
};

const ACCOUNT = { label: 'Living room TV', secrets: { televisions: [UNREACHABLE, TELEVISION] } };

let tv: FakeTv;
let record: ContextRecord;
let stop: () => Promise<void>;
let adapterRefresh: () => ReturnType<ProviderAdapter['refresh']>;
let states: Awaited<ReturnType<typeof subscribe>>['states'];

beforeEach(async () => {
  tv = await FakeTv.start();
  record = contextFor('/nonexistent');
  const adapter = await createSamsungTvModule(tv.io).start(ACCOUNT, record.context);
  ({ states, stop } = await subscribe(adapter));
  adapterRefresh = (): ReturnType<ProviderAdapter['refresh']> =>
    adapter.refresh(['a1:b2:c3:d4:e5:f6']);
  await until(() => states.some((state) => state.capability === 'power' && state.value === true));
});

afterEach(async () => {
  await stop();
  Logger.reset();
  await tv.stop();
});

const SAVED = z.object({ televisions: z.array(z.object({ host: z.string() }).loose()) });

function savedHosts(): string[] {
  return record.saved.flatMap((account) =>
    SAVED.parse(account.secrets).televisions.map((television) => television.host),
  );
}

describe('a Samsung TV that comes back on another address', () => {
  it('follows an announcement from the same television, keeps its settings and the other screens', async () => {
    tv.power = 'off';
    tv.address = 'tv-new.test';
    tv.power = 'on';
    tv.announce('tv-new.test');
    await until(() => savedHosts().includes('tv-new.test'));
    expect(record.saved.at(-1)).toEqual({
      label: 'Kitchen TV, Living room TV',
      secrets: { televisions: [UNREACHABLE, { ...TELEVISION, host: 'tv-new.test' }] },
    });
    const requests = tv.restRequests;
    const [power] = await adapterRefresh();
    expect(power?.value).toBe(true);
    expect(tv.restRequests).toBeGreaterThan(requests);
  });

  it('ignores an announcement from a television with another hardware address', async () => {
    tv.address = 'other.test';
    tv.wifiMac = '00:11:22:33:44:55';
    tv.announce('other.test');
    await until(() => tv.restRequests > 2);
    expect(savedHosts()).toEqual([]);
  });

  it('ignores an announcement from a host that does not answer as a television', async () => {
    tv.announce('printer.test');
    await until(() => tv.restRequests > 2);
    expect(savedHosts()).toEqual([]);
  });
});
