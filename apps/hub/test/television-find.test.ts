import { API_ENDPOINTS } from '@smarteverything/domain';
import type { TvInfo } from '@smarteverything/smartthings';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findTelevision,
  type FindTelevisionOptions,
} from '../src/adapters/samsung-tv/find-television';
import type { SamsungTvIo } from '../src/adapters/samsung-tv/io';
import type { ScreenDevice } from '../src/adapters/samsung-tv/screen-matching';
import type { Caller } from '../src/server/auth';
import { televisionFindRoutes } from '../src/server/handlers/television-find';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const LIVING_ROOM: TvInfo = {
  on: true,
  powerStateReported: true,
  model: 'QA65S95BAKXXT',
  frame: false,
  name: 'TV',
  wifiMac: '68:FC:CA:C1:52:E0',
};

const LIVE_TV: ScreenDevice = {
  id: 'live-tv',
  model: 'QA65S95BAKXXT',
  online: true,
  power: true,
  macs: [],
};

function io(answers: Readonly<Record<string, TvInfo>>): SamsungTvIo {
  return {
    fetch: (input): Promise<Response> => {
      const host = new URL(input instanceof Request ? input.url : input.toString()).hostname;
      const info = answers[host];
      return info === undefined
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(
            Response.json({
              device: {
                PowerState: info.on ? 'on' : 'standby',
                modelName: info.model,
                name: info.name,
                wifiMac: info.wifiMac,
              },
            }),
          );
    },
    sendMagicPacket: (): Promise<void> => Promise.resolve(),
    announcements: () => () => undefined,
    openSocket: (): never => {
      throw new Error('finding opens no socket');
    },
    clock: {
      now: (): Date => new Date(),
      at: (): (() => void) => () => undefined,
      sleep: (): Promise<void> => Promise.resolve(),
    },
  };
}

interface Harness {
  readonly options: FindTelevisionOptions;
  readonly searches: () => number;
  readonly learned: [string, string][];
  readonly links: [string, string][];
}

function harness(
  patch: Partial<FindTelevisionOptions> = {},
  answers: Readonly<Record<string, TvInfo>> = { '192.168.50.61': LIVING_ROOM },
): Harness {
  let searched = 0;
  const learned: [string, string][] = [];
  const links: [string, string][] = [];
  const options: FindTelevisionOptions = {
    search: (): Promise<readonly string[]> => {
      searched += 1;
      return Promise.resolve(['192.168.50.61', '192.168.50.9']);
    },
    io: io(answers),
    screens: () => [LIVE_TV],
    isLinked: () => false,
    isLinking: () => false,
    learn: (deviceId, mac) => {
      learned.push([deviceId, mac]);
    },
    startLink: (host, deviceId) => {
      links.push([host, deviceId]);
    },
    log: testLogger('television'),
    ...patch,
  };
  return { options, searches: () => searched, learned, links };
}

describe('finding a television that is not linked directly', () => {
  it('scans nothing when the television is already linked', async () => {
    const test = harness({ isLinked: () => true });
    expect(await findTelevision(test.options, 'live-tv')).toMatchObject({ outcome: 'linked' });
    expect(test.searches()).toBe(0);
    expect(test.links).toEqual([]);
  });

  it('scans once, saves the matched address and starts the link', async () => {
    const test = harness();
    expect(await findTelevision(test.options, 'live-tv')).toMatchObject({ outcome: 'asking' });
    expect(test.searches()).toBe(1);
    expect(test.learned).toEqual([['live-tv', '68:fc:ca:c1:52:e0']]);
    expect(test.links).toEqual([['192.168.50.61', 'live-tv']]);
  });

  it('links a television whose address is already entered without overwriting it', async () => {
    const entered: ScreenDevice = { ...LIVE_TV, macs: ['68:fc:ca:c1:52:e0'] };
    const test = harness({ screens: () => [entered] });
    expect(await findTelevision(test.options, 'live-tv')).toMatchObject({ outcome: 'asking' });
    expect(test.learned).toEqual([]);
    expect(test.links).toEqual([['192.168.50.61', 'live-tv']]);
  });

  it('does not scan again while a link is waiting for Allow', async () => {
    const test = harness({ isLinking: () => true });
    expect(await findTelevision(test.options, 'live-tv')).toMatchObject({ outcome: 'asking' });
    expect(test.searches()).toBe(0);
  });

  it('says so plainly when no screen answers', async () => {
    const test = harness({}, {});
    const result = await findTelevision(test.options, 'live-tv');
    expect(result.outcome).toBe('not_found');
    expect(result.message).toMatch(/No Samsung screen answered/);
    expect(test.links).toEqual([]);
  });

  it('says so plainly when a screen answers but is not this television', async () => {
    const other: ScreenDevice = { ...LIVE_TV, id: 'other', model: 'LS49CG954SEXXT' };
    const test = harness({ screens: () => [other] });
    const result = await findTelevision(test.options, 'other');
    expect(result.outcome).toBe('not_found');
    expect(result.message).toMatch(/could not be matched/);
    expect(test.links).toEqual([]);
    expect(test.learned).toEqual([]);
  });

  it('names the real reason when the only screen that answers belongs to another television', async () => {
    const living: ScreenDevice = { ...LIVE_TV, macs: ['68:fc:ca:c1:52:e0'] };
    const bedroom: ScreenDevice = { ...LIVE_TV, id: 'bedroom', online: false, power: false };
    const test = harness({ screens: () => [living, bedroom] });
    const result = await findTelevision(test.options, 'bedroom');
    expect(result.outcome).toBe('not_found');
    expect(result.message).toMatch(/Only another screen answered/);
    expect(test.links).toEqual([]);
    expect(test.learned).toEqual([]);
  });
});

describe('the endpoint that finds a television', () => {
  let test: TestStore;
  let owner: Caller;

  beforeEach(async () => {
    test = await testStore();
    const row = test.store.clients.create({
      name: 'Owner',
      platform: 'android',
      role: 'owner',
      tokenHash: 'a'.repeat(64),
    });
    owner = { kind: 'client', client: row };
  });

  afterEach(async () => {
    await test.close();
  });

  function tv(): string {
    const [row] = test.store.devices.upsert([
      {
        provider: 'smartthings',
        externalId: 'st-tv',
        parentId: null,
        kind: 'television',
        name: 'TV',
        model: 'QA65S95BAKXXT',
        manufacturer: 'Samsung',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    return row?.id ?? '';
  }

  function find(deviceId: string, started: string[]): Promise<unknown> {
    const routes = televisionFindRoutes(
      {
        store: test.store,
        log: testLogger('television'),
        hub: {
          providers: {
            link: (credentials) => {
              started.push(credentials.provider === 'samsung_tv' ? credentials.host : '');
              return Promise.resolve({});
            },
          },
        },
      },
      io({ '192.168.50.61': LIVING_ROOM }),
      () => Promise.resolve(['192.168.50.61']),
    );
    return routes.findTelevision.run(
      owner,
      { params: { deviceId }, query: {}, body: undefined, remote: '127.0.0.1' },
      testLogger('television'),
    );
  }

  it('saves the address and starts the link for an unlinked television', async () => {
    const id = tv();
    const started: string[] = [];
    const reply = API_ENDPOINTS.findTelevision.response.parse(await find(id, started));
    expect(reply.outcome).toBe('asking');
    expect(started).toEqual(['192.168.50.61']);
    expect(test.store.televisionSettings.find(id)?.wake_macs).toEqual(['68:fc:ca:c1:52:e0']);
  });

  it('does not search for a television that is linked', async () => {
    const id = tv();
    test.store.televisionSettings.setDirectLinks([
      { deviceId: id, host: '192.168.50.61', macAddress: '68:fc:ca:c1:52:e0' },
    ]);
    const started: string[] = [];
    const reply = API_ENDPOINTS.findTelevision.response.parse(await find(id, started));
    expect(reply.outcome).toBe('linked');
    expect(started).toEqual([]);
  });
});
