import { describe, expect, it } from 'vitest';
import {
  DATA_POINT_RELATIONS,
  SMART_LIFE_SPECIFICATION,
  SMART_LIFE_TOKEN,
  buildDeviceModel,
  dataPointsOf,
  irSchemeOf,
  irWrites,
  readLoginReply,
  readQrToken,
  smartLifeModel,
} from '../src';

const USER_CODE = 'EU1a2B3c';

const S06_SPECIFICATION = {
  functions: [
    {
      code: 'control',
      type: 'Enum',
      values: '{"range":["study","send_ir","study_exit","delete_study_code"]}',
    },
    { code: 'ir_code', type: 'Raw', values: '{"maxlen":128}' },
    { code: 'key_code', type: 'Raw', values: '{"maxlen":128}' },
    { code: 'key_study', type: 'Raw', values: '{"maxlen":128}' },
    { code: 'type', type: 'Integer', values: '{"min":0,"max":3,"scale":0,"step":1}' },
  ],
  status: [
    {
      code: 'control',
      type: 'Enum',
      values: '{"range":["study","send_ir","study_exit","delete_study_code"]}',
    },
    { code: 'study_code', type: 'Raw', values: '{"maxlen":128}' },
    {
      code: 'va_temperature',
      type: 'Integer',
      values: '{"unit":"℃","min":-200,"max":600,"scale":1,"step":1}',
    },
  ],
};

function relation(dpId: number, code: string, valueType: string): object {
  return {
    dpId,
    statusFormat: JSON.stringify({ [code]: '$' }),
    valueConvert: 'default',
    valueType,
    valueDesc: '{}',
    enumMappingMap: null,
    supportLocal: true,
  };
}

const S06_RELATIONS = {
  dpStatusRelationDTOS: [
    relation(1, 'control', 'enum'),
    relation(2, 'study_code', 'raw'),
    relation(3, 'ir_code', 'raw'),
    relation(4, 'key_code', 'raw'),
    relation(7, 'key_study', 'raw'),
    relation(13, 'type', 'value'),
    relation(18, 'va_temperature', 'value'),
  ],
};

describe('recorded Smart Life replies', () => {
  it('reads the QR token, the pending scan and the confirmed scan', () => {
    expect(readQrToken({ success: true, result: { qrcode: 'qr-token-0001' }, t: 1 })).toBe(
      'qr-token-0001',
    );
    expect(
      readLoginReply({ success: false, code: 'E0020003', msg: 'not confirmed yet' }, USER_CODE),
    ).toStrictEqual({ kind: 'waiting' });
    const reply = readLoginReply(
      {
        success: true,
        t: 1_760_000_000_000,
        result: {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expire_time: 7200,
          uid: 'ay1760000000000abcde',
          terminal_id: 'terminal-0001',
          endpoint: 'https://openapi.eu.example.test',
          username: 'eu-1760000000',
        },
      },
      USER_CODE,
    );
    expect(reply).toMatchObject({
      kind: 'signed_in',
      session: { userCode: USER_CODE, expiresAt: 1_760_000_000_000 + 7_200_000 },
    });
  });

  it('reads the refreshed tokens', () => {
    expect(
      SMART_LIFE_TOKEN.parse({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expireTime: 7200,
        uid: 'ay1760000000000abcde',
      }),
    ).toStrictEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expireTime: 7200,
      uid: 'ay1760000000000abcde',
    });
  });

  it('derives the infrared data points of a wnykq S06 blaster from its published specification', () => {
    const model = smartLifeModel(
      SMART_LIFE_SPECIFICATION.parse(S06_SPECIFICATION),
      DATA_POINT_RELATIONS.parse(S06_RELATIONS),
      false,
    );
    expect(model.cloudReports).toBe('data_points');
    const { points } = dataPointsOf(model.sources);
    const scheme = irSchemeOf(points, new Set());
    expect(scheme).toMatchObject({
      kind: 'dp1',
      control: { code: 'control', dpId: 1 },
      learned: { code: 'study_code', dpId: 2 },
      study: { code: 'key_study', dpId: 7 },
    });
    if (scheme === null) {
      throw new Error('the blaster has no infrared scheme');
    }
    expect(irWrites(scheme, { kind: 'study_start' })).toStrictEqual([
      { code: 'control', dpId: 1, value: 'study' },
    ]);
    expect(buildDeviceModel('wnykq', points, new Set()).capabilities.map((c) => c.key)).toEqual(
      expect.arrayContaining(['ir_learn', 'ir_send', 'temperature']),
    );
  });
});
