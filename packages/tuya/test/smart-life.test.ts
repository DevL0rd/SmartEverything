import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ANY_RESULT,
  CUSTOM_TYPE,
  CloudMessageError,
  DATA_POINT_RELATIONS,
  SMART_LIFE_DEVICES,
  SMART_LIFE_HOMES,
  SMART_LIFE_MESSAGING,
  SMART_LIFE_PATHS,
  SMART_LIFE_ROOM,
  SMART_LIFE_SPECIFICATION,
  SMART_LIFE_TOKEN,
  SmartLifeCryptoError,
  TuyaResponseError,
  deviceTopic,
  ownerTopic,
  readSealedReply,
  readSmartLifeMessage,
  sealRequest,
  type SmartLifeSession,
} from '../src';
import {
  openPayload,
  requestHashKey,
  requestSecret,
  sealPayload,
  signRequest,
} from '../src/smart-life-crypto';

const HASH_KEY = '50a14b9f743afd04941d0920523a8541';
const SECRET = '5ed3824bf50af73b';
const NONCE = 'abcdefghijkl';
const SEALED = 'YWJjZGVmZ2hpamtsfkeuT56e0WO/mmb1to2V79rNezNH7vs=';

const SESSION: SmartLifeSession = {
  userCode: 'uc',
  terminalId: 'terminal',
  endpoint: 'https://eu.example.com',
  uid: 'uid',
  username: null,
  accessToken: 'at',
  refreshToken: 'refresh-token',
  expiresAt: 0,
};

const ENTROPY = { requestId: 'req-1', t: 1_700_000_000_000, nonce: (): string => NONCE };

describe('Smart Life request crypto', () => {
  it('derives the hash key and secret exactly as the earlier noble implementation did', () => {
    expect(requestHashKey('req-1', 'refresh-token')).toBe(HASH_KEY);
    expect(requestSecret('req-1', HASH_KEY)).toBe(SECRET);
  });

  it('seals a payload to the bytes the earlier noble implementation produced', () => {
    expect(sealPayload('{"a":1}', SECRET, NONCE)).toBe(SEALED);
  });

  it('opens what it sealed and refuses what it cannot open', () => {
    expect(openPayload(SEALED, SECRET)).toBe('{"a":1}');
    expect(() => openPayload(SEALED, 'ffffffffffffffff')).toThrow(SmartLifeCryptoError);
    expect(() => openPayload('***', SECRET)).toThrow(/the reply did not decrypt/);
  });

  it('refuses a nonce that is not twelve characters', () => {
    expect(() => sealPayload('x', SECRET, 'short')).toThrow(
      new SmartLifeCryptoError('the nonce must be 12 characters, not 5'),
    );
  });

  it('signs the non-empty signed headers and both sealed parts', () => {
    const headers = {
      'X-appKey': 'k',
      'X-requestId': 'req-1',
      'X-sid': '',
      'X-time': '1700000000000',
      'X-token': 'at',
    };
    expect(signRequest(HASH_KEY, headers, 'QQ', 'BB')).toBe(
      'd047d35e8895794a133c752c52bbee3a3ed90d647057336c38bbe467beb59000',
    );
  });
});

describe('sealed Smart Life requests', () => {
  it('seal the query into the URL and the body into a JSON envelope, signed', () => {
    const sealed = sealRequest(
      SESSION,
      { method: 'POST', path: '/v1.0/m/x', query: { a: '1' }, body: { b: 2 } },
      ENTROPY,
    );
    const url = new URL(sealed.url);
    expect(url.origin).toBe('https://eu.example.com');
    expect(openPayload(url.searchParams.get('encdata') ?? '', sealed.secret)).toBe('{"a":"1"}');
    expect(sealed.secret).toBe(SECRET);
    expect(sealed.init).toMatchObject({
      method: 'POST',
      headers: { 'X-requestId': 'req-1', 'X-token': 'at', 'Content-Type': 'application/json' },
    });
    const body = z
      .object({ encdata: z.string() })
      .parse(JSON.parse(z.string().parse(sealed.init.body)));
    expect(openPayload(body.encdata, sealed.secret)).toBe('{"b":2}');
  });

  it('send neither query nor body when there is nothing to seal', () => {
    const sealed = sealRequest(SESSION, { method: 'GET', path: '/v1.0/m/x', body: {} }, ENTROPY);
    expect(sealed.url).toBe('https://eu.example.com/v1.0/m/x');
    expect(sealed.init).not.toHaveProperty('body');
    expect(sealed.init.headers).not.toHaveProperty('Content-Type');
  });
});

describe('sealed Smart Life replies', () => {
  const reply = (result: string | undefined): unknown => ({ success: true, t: 5, result });

  it('open the result and read it as JSON', () => {
    expect(readSealedReply('op', ANY_RESULT, reply(SEALED), SECRET)).toStrictEqual({
      value: { a: 1 },
      t: 5,
    });
  });

  it('keep a result that is plain text', () => {
    const text = sealPayload('plain words', SECRET, NONCE);
    expect(readSealedReply('op', ANY_RESULT, reply(text), SECRET).value).toBe('plain words');
  });

  it('read a missing or empty result as nothing', () => {
    expect(readSealedReply('op', ANY_RESULT, { success: true }, SECRET)).toStrictEqual({
      value: undefined,
      t: null,
    });
    expect(readSealedReply('op', ANY_RESULT, reply(''), SECRET).value).toBeUndefined();
  });

  it('name the failure of a refused call and the shape of a malformed one', () => {
    expect(() =>
      readSealedReply(
        'op',
        ANY_RESULT,
        { success: false, code: 1004, msg: 'sign invalid' },
        SECRET,
      ),
    ).toThrow(/code 1004/);
    expect(() => readSealedReply('op', ANY_RESULT, { success: 'yes' }, SECRET)).toThrow(
      TuyaResponseError,
    );
  });
});

describe('Smart Life paths', () => {
  it('address one device by its id', () => {
    expect(SMART_LIFE_PATHS.specification('d1')).toBe('/v1.1/m/life/d1/specifications');
    expect(SMART_LIFE_PATHS.dataPointRelations('d1')).toBe('/v1.0/m/life/devices/d1/status');
    expect(SMART_LIFE_PATHS.customType('d1')).toBe('/v1.0/m/life/ha/d1/code/custom-type');
    expect(SMART_LIFE_PATHS.room('d1')).toBe('/v1.0/m/thing/ha/d1/room');
    expect(SMART_LIFE_PATHS.commands('d1')).toBe('/v1.1/m/thing/d1/commands');
    expect(SMART_LIFE_PATHS.refreshToken('rt')).toBe('/v1.0/m/token/rt');
  });
});

describe('Smart Life schemas', () => {
  it('read homes whose owner id is text or a number', () => {
    expect(SMART_LIFE_HOMES.parse([{ ownerId: 7, name: 'Home' }])).toStrictEqual([
      { ownerId: '7', name: 'Home' },
    ]);
  });

  it('default the status of a device and read its optional uuid', () => {
    const [device] = SMART_LIFE_DEVICES.parse([
      {
        id: 'd',
        name: 'n',
        category: 'c',
        product_id: 'p',
        sub: false,
        online: true,
        uuid: 'u',
      },
    ]);
    expect(device).toMatchObject({ id: 'd', uuid: 'u', status: [] });
  });

  it('default missing specification lists', () => {
    expect(SMART_LIFE_SPECIFICATION.parse({})).toStrictEqual({ functions: [], status: [] });
  });

  it('read data point relations', () => {
    const relation = {
      dpId: 1,
      statusFormat: '{}',
      valueConvert: 'default',
      valueType: 'bool',
      valueDesc: '{}',
      enumMappingMap: null,
      supportLocal: true,
    };
    expect(DATA_POINT_RELATIONS.parse({ dpStatusRelationDTOS: [relation] })).toStrictEqual({
      dpStatusRelationDTOS: [relation],
    });
  });

  it('read the custom type flag from text or a boolean', () => {
    expect(CUSTOM_TYPE.parse('TRUE')).toBe(true);
    expect(CUSTOM_TYPE.parse('false')).toBe(false);
    expect(CUSTOM_TYPE.parse(true)).toBe(true);
    expect(CUSTOM_TYPE.parse(1)).toBe(false);
  });

  it('read the name of a device room, or none', () => {
    expect(SMART_LIFE_ROOM.parse({ id: 3, name: 'Kitchen' })).toBe('Kitchen');
    expect(SMART_LIFE_ROOM.parse(null)).toBeNull();
  });

  it('read a token and the messaging configuration', () => {
    expect(
      SMART_LIFE_TOKEN.parse({ accessToken: 'a', refreshToken: 'r', expireTime: 1, uid: 'u' }),
    ).toMatchObject({ uid: 'u' });
    const messaging = SMART_LIFE_MESSAGING.parse({
      url: 'ssl://mq.example.com:8883',
      clientId: 'c',
      username: 'u',
      password: 'p',
      expireTime: 60,
      topic: { ownerId: { sub: 'o/{ownerId}' }, devId: { sub: 'd/{devId}' } },
    });
    expect(ownerTopic(messaging, 'home1')).toBe('o/home1');
    expect(deviceTopic(messaging, 'dev1', true)).toBe('d/dev1/pen');
    expect(deviceTopic(messaging, 'dev1', false)).toBe('d/dev1/sta');
  });
});

describe('Smart Life MQTT messages', () => {
  it('split a device report into status items and data points', () => {
    expect(
      readSmartLifeMessage(
        JSON.stringify({
          protocol: 4,
          data: {
            devId: 'd1',
            status: [
              { code: 'switch_1', value: true },
              { dpId: 2, value: 'x' },
            ],
          },
        }),
      ),
    ).toStrictEqual([
      { kind: 'status', deviceId: 'd1', items: [{ code: 'switch_1', value: true }] },
      { kind: 'data_points', deviceId: 'd1', dps: { '2': 'x' } },
    ]);
  });

  it('report nothing for a report without values', () => {
    expect(
      readSmartLifeMessage(JSON.stringify({ protocol: 4, data: { devId: 'd1', status: [] } })),
    ).toStrictEqual([]);
  });

  it('read business messages and name other protocols', () => {
    expect(
      readSmartLifeMessage(
        JSON.stringify({ protocol: 20, data: { bizCode: 'online', bizData: { devId: 'd1' } } }),
      ),
    ).toStrictEqual([{ kind: 'online', deviceId: 'd1' }]);
    expect(readSmartLifeMessage(JSON.stringify({ protocol: 99 }))).toStrictEqual([
      { kind: 'other', bizCode: 'protocol 99' },
    ]);
  });

  it('refuse payloads that are not JSON or do not fit', () => {
    expect(() => readSmartLifeMessage('nope')).toThrow(CloudMessageError);
    expect(() => readSmartLifeMessage('nope')).toThrow(/the MQTT payload is not JSON/);
    expect(() => readSmartLifeMessage('{}')).toThrow(/the MQTT payload does not fit/);
  });
});
