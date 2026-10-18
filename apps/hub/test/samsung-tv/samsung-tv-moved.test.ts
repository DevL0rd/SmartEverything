import type { ProviderAdapter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSamsungTvModule } from '../../src/adapters/samsung-tv/index';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

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

function savedHosts(): unknown[] {
  return record.saved.map((account) => account.secrets['host']);
}

describe('a Samsung TV that comes back on another address', () => {
  it('follows an announcement from the same television and keeps its settings', async () => {
    tv.power = 'off';
    tv.address = 'tv-new.test';
    tv.power = 'on';
    tv.announce('tv-new.test');
    await until(() => savedHosts().includes('tv-new.test'));
    const moved = record.saved.at(-1);
    expect(moved?.secrets).toMatchObject({ ...ACCOUNT.secrets, host: 'tv-new.test' });
    const requests = tv.restRequests;
    const [power] = await adapterRefresh();
    expect(power?.value).toBe(true);
    expect(tv.restRequests).toBeGreaterThan(requests);
  });

  it('ignores an announcement from a television with another hardware address', async () => {
    tv.address = 'other.test';
    tv.wifiMac = '00:11:22:33:44:55';
    tv.announce('other.test');
    await until(() => tv.restRequests > 1);
    expect(savedHosts()).toEqual([]);
  });

  it('ignores an announcement from a host that does not answer as a television', async () => {
    tv.announce('printer.test');
    await until(() => tv.restRequests > 1);
    expect(savedHosts()).toEqual([]);
  });
});
