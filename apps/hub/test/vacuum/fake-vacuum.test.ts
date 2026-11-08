import { createSocket } from 'node:dgram';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import {
  decodeMapLayer,
  decryptMapBlob,
  parseToken,
  pv11glCatalog,
  roomCellCounts,
} from '@smarteverything/xiaomi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { XiaomiCloud } from '../../src/adapters/xiaomi/cloud-api';
import { MessageIds, MiioClient } from '../../src/adapters/xiaomi/miio-client';
import { FakeVacuum, vacuumObjectName, type VacuumIdentity } from '../support/fake-vacuum';
import { FakeVacuumCloud } from '../support/fake-vacuum-cloud';
import { until } from '../support/wait';
import { FakeAccount, SSECURITY, USER_ID } from '../xiaomi/fake-account';
import { dependencies, routedFetch } from '../xiaomi/harness';

const TOKEN = '0123456789abcdef0123456789abcdef';
const HOST = '127.0.0.6';
const IDENTITY: VacuumIdentity = { did: '5550001', uid: '4440002' };
const PLAIN_ROOMS = ['[4]', '3,4', '{"rooms":[3]}'];
const BAD_ZONES = [
  '[{"blocks_region":[1,2,3],"blocks_attr":0}]',
  'not json',
  '[]',
  '{"blocks_region":[1,2,3,4,5,6,7,8],"blocks_attr":0}',
];

let vacuum: FakeVacuum;
let client: MiioClient;
let uplinks: string[];

const UPLINK = z.object({ method: z.string(), params: JSON_VALUE });
const CHANGES = z.array(z.object({ siid: z.number(), piid: z.number(), value: JSON_VALUE }));
const READING = z.tuple([z.object({ value: JSON_VALUE.optional() })]);
const CONFIG = z.object({
  rooms: z.array(z.number()).optional(),
  zones: z.array(z.array(z.number())).optional(),
  clean_mode: z.number(),
});
const OUTPUT = z.object({
  code: z.number(),
  out: z.array(z.object({ piid: z.number(), value: z.string() })),
});
const FILE_URL = z.object({ url: z.string() });

function change(body: string): z.infer<typeof UPLINK> {
  return UPLINK.parse(JSON.parse(body));
}

function pushedValues(): Map<string, JsonValue> {
  const values = new Map<string, JsonValue>();
  for (const body of uplinks) {
    const { method, params } = change(body);
    if (method === 'properties_changed') {
      for (const entry of CHANGES.parse(params)) {
        values.set(`${String(entry.siid)}.${String(entry.piid)}`, entry.value);
      }
    }
  }
  return values;
}

function pushedConfig(): z.infer<typeof CONFIG> {
  return CONFIG.parse(JSON.parse(z.string().parse(pushedValues().get('2.40'))));
}

async function read(siid: number, piid: number): Promise<JsonValue> {
  const [first] = READING.parse(
    await client.call('get_properties', [{ did: IDENTITY.did, siid, piid }]),
  );
  return first.value ?? null;
}

function action(siid: number, aiid: number, inputs: readonly JsonValue[]): Promise<JsonValue> {
  return client.call('action', { did: IDENTITY.did, siid, aiid, in: [...inputs] });
}

function room(value: JsonValue): JsonValue {
  return { piid: 15, value };
}

function zone(value: JsonValue): JsonValue {
  return { piid: 12, value };
}

beforeEach(async () => {
  uplinks = [];
  vacuum = new FakeVacuum({ host: HOST, deviceId: 0x0a0b0c0e, token: TOKEN, ...IDENTITY });
  const port = await vacuum.start();
  client = new MiioClient({
    host: HOST,
    port,
    token: parseToken(TOKEN),
    socket: createSocket('udp4'),
    timing: dependencies(routedFetch([]), port).timing,
    now: (): number => Date.now(),
    log: new Logger('tool.xiaomi-test'),
    messageIds: new MessageIds(0),
  });
  client.onUplink((body) => {
    uplinks.push(body);
  });
});

afterEach(async () => {
  await client.close();
  await vacuum.stop();
});

describe('fake pv11gl device', () => {
  it('answers reads from the recorded readings with the home identifiers filled in', async () => {
    expect(await read(2, 2)).toBe(9);
    expect(await read(10, 1)).toBe(
      `{"index":1692830372,"obj_name":"${vacuumObjectName(IDENTITY, 0)}"}`,
    );
    const missing = await client.call('get_properties', [{ siid: 99, piid: 1 }]);
    expect(missing).toStrictEqual([{ siid: 99, piid: 1, code: -4004 }]);
  });

  it('starts a room clean only from the piid-tagged room input and pushes the new state', async () => {
    const reply = await action(2, 16, [room('[3,4]')]);
    expect(reply).toStrictEqual({ code: 0, out: [] });
    await until(() => uplinks.length > 0);
    const values = pushedValues();
    expect(values.get('2.5')).toBe(3);
    expect(values.get('2.2')).toBe(4);
    expect(pushedConfig()).toMatchObject({ rooms: [3, 4], clean_mode: 3 });
    expect(await read(2, 2)).toBe(4);
    expect(vacuum.actions).toStrictEqual([
      { siid: 2, aiid: 16, inputs: [room('[3,4]')], outcome: 'changed' },
    ]);
  });

  it('accepts a single tagged room id and a comma separated list', async () => {
    await action(2, 16, [room('3')]);
    await until(() => pushedValues().has('2.40'));
    expect(pushedConfig()).toMatchObject({ rooms: [3] });
    await action(2, 16, [room('3,4')]);
    await until(() => pushedConfig().rooms?.length === 2);
  });

  it.each(PLAIN_ROOMS)('answers code 0 and does nothing for the plain value %s', async (value) => {
    const reply = await action(2, 16, [value]);
    expect(reply).toStrictEqual({ code: 0, out: [] });
    expect(await read(2, 2)).toBe(9);
    expect(uplinks).toStrictEqual([]);
    expect(vacuum.actions[0]?.outcome).toBe('no-effect');
  });

  it('ignores a real JSON array value and a tag with the wrong piid', async () => {
    await action(2, 16, [{ piid: 15, value: [3, 4] }]);
    await action(2, 16, [{ piid: 12, value: '[3,4]' }]);
    expect(await read(2, 2)).toBe(9);
    expect(uplinks).toStrictEqual([]);
  });

  it('starts a zone clean from the piid-tagged zone input', async () => {
    const region = [-500, 300, -500, -300, 500, -300, 500, 300];
    const text = JSON.stringify([{ blocks_region: region, blocks_attr: 0 }]);
    await action(2, 37, [zone(text)]);
    await until(() => pushedValues().has('2.40'));
    const values = pushedValues();
    expect(values.get('2.5')).toBe(2);
    expect(values.get('2.2')).toBe(4);
    expect(pushedConfig()).toMatchObject({ zones: [region], clean_mode: 2 });
  });

  it.each(BAD_ZONES)('ignores the malformed zone payload %s', async (text) => {
    expect(await action(2, 37, [zone(text)])).toStrictEqual({ code: 0, out: [] });
    expect(await action(2, 37, [text])).toStrictEqual({ code: 0, out: [] });
    expect(await read(2, 2)).toBe(9);
    expect(uplinks).toStrictEqual([]);
  });

  it('answers the recorded output for an action and lets a test set another', async () => {
    const recorded = OUTPUT.parse(await action(21, 5, []));
    expect(recorded.code).toBe(0);
    expect(recorded.out[0]?.value).toContain('video_switch_status');
    vacuum.setActionOutput(2, 47, [{ piid: 24, value: '{}' }]);
    expect(await action(2, 47, [])).toStrictEqual({ code: 0, out: [{ piid: 24, value: '{}' }] });
  });

  it('writes writable properties, refuses read-only ones and pushes only real changes', async () => {
    const answers = await client.call('set_properties', [
      { did: IDENTITY.did, siid: 2, piid: 9, value: 1 },
      { did: IDENTITY.did, siid: 2, piid: 2, value: 1 },
      { did: IDENTITY.did, siid: 99, piid: 1, value: 1 },
    ]);
    expect(answers).toStrictEqual([
      { siid: 2, piid: 9, code: 0 },
      { siid: 2, piid: 2, code: -4002 },
      { siid: 99, piid: 1, code: -4004 },
    ]);
    await until(() => pushedValues().has('2.9'));
    expect([...pushedValues().keys()]).toStrictEqual(['2.9']);
    expect(await read(2, 2)).toBe(9);
    await client.call('set_properties', [{ did: IDENTITY.did, siid: 2, piid: 9, value: 1 }]);
    expect(await read(2, 9)).toBe(1);
    expect(uplinks).toHaveLength(1);
  });

  it('replays the recorded status timeline as pushes and event_occured messages', async () => {
    await read(2, 2);
    const sent = vacuum.replayStatusTimeline();
    await until(() => uplinks.length === sent);
    const events = uplinks.map(change).filter((entry) => entry.method === 'event_occured');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.params).toMatchObject({ did: IDENTITY.did, siid: 2, eiid: 2 });
    expect(pushedValues().get('2.2')).toBe(vacuum.properties.get('2.2'));
  });

  it('replays the recorded live pushes without waiting', async () => {
    await read(2, 2);
    const sent = vacuum.replayPushes();
    await until(() => uplinks.length === sent);
    expect(pushedValues().get('2.66')).toBe(vacuum.properties.get('2.66'));
  });
});

describe('fake pv11gl cloud', () => {
  let account: FakeAccount;
  let cloud: FakeVacuumCloud;
  let fetch: ReturnType<typeof routedFetch>;
  let xiaomi: XiaomiCloud;

  beforeEach(() => {
    account = new FakeAccount({ captcha: false, verification: false, wrongCaptchas: 0 });
    account.serviceToken = 'service';
    cloud = new FakeVacuumCloud(account, IDENTITY);
    fetch = routedFetch([cloud.route]);
    xiaomi = new XiaomiCloud(
      dependencies(fetch, 0),
      {
        userId: USER_ID,
        passToken: 'pass',
        ssecurity: SSECURITY,
        serviceToken: 'service',
        deviceId: 'device',
        region: 'de',
      },
      {
        saveSecrets: (): Promise<void> => Promise.resolve(),
        needsAttention: (): Promise<void> => Promise.resolve(),
        log: new Logger('tool.xiaomi-test'),
      },
    );
  });

  async function download(path: string, slot: number): Promise<Uint8Array> {
    const result = await xiaomi.call(path, { obj_name: vacuumObjectName(IDENTITY, slot) });
    const url = FILE_URL.parse(result).url;
    const response = await fetch(url, { method: 'GET' });
    return new Uint8Array(await response.arrayBuffer());
  }

  it('serves the current map through the pro variant as a blob the decoder opens', async () => {
    const bytes = await download('/v2/home/get_interim_file_url_pro', 0);
    const map = decryptMapBlob(bytes, pv11glCatalog().model, IDENTITY.did);
    expect(decodeMapLayer(map, 'map_data')).toHaveLength(map.width * map.height);
    expect(roomCellCounts(decodeMapLayer(map, 'map_data')).size).toBeGreaterThan(1);
    expect(map.paths?.points.length).toBeGreaterThan(0);
    expect(cloud.downloads).toStrictEqual([vacuumObjectName(IDENTITY, 0)]);
  });

  it('serves saved maps and backups through the pro variant and counts every request', async () => {
    await download('/v2/home/get_interim_file_url_pro', 3);
    await download('/v2/home/get_interim_file_url_pro', 8);
    expect(cloud.urlRequests.map((request) => request.objName)).toStrictEqual([
      vacuumObjectName(IDENTITY, 3),
      vacuumObjectName(IDENTITY, 8),
    ]);
    expect(cloud.downloads).toHaveLength(2);
  });

  it('refuses the pro variant on demand and still serves the plain one', async () => {
    cloud.proUnavailable = true;
    await expect(download('/v2/home/get_interim_file_url_pro', 0)).rejects.toThrow();
    const bytes = await download('/v2/home/get_interim_file_url', 0);
    expect(decryptMapBlob(bytes, pv11glCatalog().model, IDENTITY.did).width).toBeGreaterThan(0);
  });

  it('rejects an object that is not stored and answers a null file as text', async () => {
    await expect(download('/v2/home/get_interim_file_url_pro', 7)).rejects.toThrow();
    cloud.setNullFile(vacuumObjectName(IDENTITY, 7));
    const bytes = await download('/v2/home/get_interim_file_url_pro', 7);
    expect(new TextDecoder().decode(bytes)).toBe('This is a null file');
  });
});
