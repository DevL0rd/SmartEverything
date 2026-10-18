import { describe, expect, it } from 'vitest';
import {
  DATA_POINT_RELATIONS,
  SMART_LIFE_CLIENT_ID,
  SMART_LIFE_LOGIN_HOST,
  SMART_LIFE_QR_PREFIX,
  SMART_LIFE_SCAN_PENDING,
  SMART_LIFE_SCHEMA,
  SMART_LIFE_SPECIFICATION,
  TuyaCloudError,
  TuyaResponseError,
  isLanWritable,
  loginResultUrl,
  qrContent,
  qrTokenUrl,
  readLoginReply,
  readQrToken,
  smartLifeModel,
  type DataPointConversion,
} from '../src';

const USER_CODE = 'ab12cd34';

describe('Smart Life QR sign-in', () => {
  it('asks for a QR token with the client, user code and schema', () => {
    const url = new URL(qrTokenUrl(USER_CODE));
    expect(url.origin).toBe(SMART_LIFE_LOGIN_HOST);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      clientid: SMART_LIFE_CLIENT_ID,
      usercode: USER_CODE,
      schema: SMART_LIFE_SCHEMA,
    });
  });

  it('polls the result of one token, escaping it in the path', () => {
    const url = new URL(loginResultUrl('a/b c', USER_CODE));
    expect(url.pathname.endsWith('/tokens/a%2Fb%20c')).toBe(true);
    expect(url.searchParams.get('usercode')).toBe(USER_CODE);
  });

  it('puts the token behind the prefix the Smart Life app scans', () => {
    expect(qrContent('tok')).toBe(`${SMART_LIFE_QR_PREFIX}tok`);
  });

  it('reads the QR token from a success answer and refuses a failure', () => {
    expect(readQrToken({ success: true, result: { qrcode: 'tok' } })).toBe('tok');
    expect(() => readQrToken({ success: false, code: 1004, msg: 'sign wrong' })).toThrow(
      TuyaCloudError,
    );
    expect(() => readQrToken({ success: true, result: {} })).toThrow(TuyaResponseError);
  });

  it('keeps waiting while nobody has scanned the code', () => {
    expect(
      readLoginReply({ success: false, code: SMART_LIFE_SCAN_PENDING, msg: 'wait' }, USER_CODE),
    ).toEqual({ kind: 'waiting' });
  });

  it('turns a scanned code into a session that expires from the cloud clock', () => {
    const reply = readLoginReply(
      {
        success: true,
        t: 1_000_000,
        result: {
          access_token: 'access',
          refresh_token: 'refresh',
          expire_time: 7200,
          uid: 'uid1',
          terminal_id: 'term1',
          endpoint: 'https://apigw.iotbing.com',
          username: 'sam',
        },
      },
      USER_CODE,
    );
    expect(reply).toEqual({
      kind: 'signed_in',
      session: {
        userCode: USER_CODE,
        terminalId: 'term1',
        endpoint: 'https://apigw.iotbing.com',
        uid: 'uid1',
        username: 'sam',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: 1_000_000 + 7200 * 1000,
      },
    });
  });

  it('stores no username when the cloud gives none', () => {
    const reply = readLoginReply(
      {
        success: true,
        t: 1,
        result: {
          access_token: 'a',
          refresh_token: 'r',
          expire_time: 1,
          uid: 'u',
          terminal_id: 't',
          endpoint: 'https://apigw.iotbing.com',
        },
      },
      USER_CODE,
    );
    expect(reply.kind === 'signed_in' ? reply.session.username : 'waiting').toBeNull();
  });

  it('refuses another failure than the pending scan', () => {
    expect(() =>
      readLoginReply({ success: false, code: 'E0020004', msg: 'expired' }, USER_CODE),
    ).toThrow(TuyaCloudError);
  });
});

const SPECIFICATION = SMART_LIFE_SPECIFICATION.parse({
  functions: [{ code: 'switch_1', type: 'Boolean', values: '{}' }],
  status: [
    { code: 'switch_1', type: 'Boolean', values: '{}' },
    { code: 'cur_power', type: 'Integer', values: '{}' },
  ],
});

function relation(over: Record<string, unknown>): Record<string, unknown> {
  return {
    dpId: 1,
    statusFormat: '{"switch_1":true}',
    valueConvert: 'default',
    valueType: 'bool',
    valueDesc: '{}',
    enumMappingMap: null,
    supportLocal: true,
    ...over,
  };
}

function relations(
  ...items: Record<string, unknown>[]
): ReturnType<typeof DATA_POINT_RELATIONS.parse> {
  return DATA_POINT_RELATIONS.parse({ dpStatusRelationDTOS: items });
}

describe('the model Smart Life gives a device', () => {
  it('gives each specification code the data point that reports it', () => {
    const model = smartLifeModel(
      SPECIFICATION,
      relations(relation({}), relation({ dpId: 18, statusFormat: '{"cur_power":0}' })),
      false,
    );
    expect(model.sources.functions.map((item) => [item.code, item.dp_id])).toEqual([
      ['switch_1', 1],
    ]);
    expect(model.sources.status.map((item) => [item.code, item.dp_id])).toEqual([
      ['switch_1', 1],
      ['cur_power', 18],
    ]);
    expect([...model.conversions.keys()]).toEqual([1, 18]);
    expect(model.cloudReports).toBe('data_points');
    expect(model.cloudReportReason).toBe('all_data_points_local');
  });

  it('leaves a code without a data point unaddressed', () => {
    const model = smartLifeModel(SPECIFICATION, relations(relation({})), false);
    expect(model.sources.status.map((item) => item.dp_id)).toEqual([1, null]);
  });

  it('rejects a data point without a readable code and one with an unknown conversion', () => {
    const model = smartLifeModel(
      SPECIFICATION,
      relations(
        relation({ dpId: 2, statusFormat: 'not json' }),
        relation({ dpId: 3, statusFormat: '[]' }),
        relation({ dpId: 4, statusFormat: '{}' }),
        relation({ dpId: 5, statusFormat: '{"mystery":1}', valueConvert: 'sdk_unknown' }),
      ),
      false,
    );
    expect(model.conversions.size).toBe(0);
    expect(model.rejected).toEqual([
      { code: 'dp_2', reason: 'Tuya gave it no Smart Life code in statusFormat' },
      { code: 'dp_3', reason: 'Tuya gave it no Smart Life code in statusFormat' },
      { code: 'dp_4', reason: 'Tuya gave it no Smart Life code in statusFormat' },
      {
        code: 'mystery',
        reason: 'Tuya converts it with "sdk_unknown", which the Smart Life SDK does not define',
      },
    ]);
  });

  it('says why the cloud reports by code instead of by data point', () => {
    const reason = (items: Record<string, unknown>[], custom: boolean): string =>
      smartLifeModel(SPECIFICATION, relations(...items), custom).cloudReportReason;
    expect(reason([relation({})], true)).toBe('custom_code_type');
    expect(reason([], false)).toBe('no_data_points');
    expect(reason([relation({ supportLocal: false })], false)).toBe('data_point_not_local');
    expect(smartLifeModel(SPECIFICATION, relations(), false).cloudReports).toBe('codes');
  });
});

describe('which data points the LAN may write', () => {
  const conversion = (name: string): DataPointConversion => ({
    name,
    dpId: 1,
    code: 'switch_1',
    valueType: 'bool',
    valueDesc: '{}',
    enumMappings: null,
  });

  it('allows a data point that Smart Life reports unconverted', () => {
    expect(isLanWritable(new Map([[1, conversion('default')]]), 1)).toBe(true);
  });

  it('refuses a converted data point, an unknown one and a device without an id', () => {
    expect(isLanWritable(new Map([[1, conversion('percentage')]]), 1)).toBe(false);
    expect(isLanWritable(new Map(), 1)).toBe(false);
    expect(isLanWritable(new Map(), null)).toBe(false);
  });

  it('allows any data point when no conversions are known', () => {
    expect(isLanWritable(null, 7)).toBe(true);
  });
});
