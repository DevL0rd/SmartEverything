import { describe, expect, it } from 'vitest';
import { CloudMessageError, INVENTORY_BIZ_CODES, readSmartLifeMessage } from '../src';

describe('cloud messages', () => {
  it('names the three business codes that change the device list', () => {
    expect(INVENTORY_BIZ_CODES).toStrictEqual(['bindUser', 'delete', 'nameUpdate']);
  });

  it('says why a message could not be read', () => {
    expect(new CloudMessageError('x')).toMatchObject({
      name: 'CloudMessageError',
      reason: 'x',
      message: 'A Tuya cloud message could not be read: x.',
    });
  });

  it('reads a business message by what it says about the device', () => {
    const business = (bizCode: string, bizData?: object): string =>
      JSON.stringify({
        protocol: 20,
        data: { bizCode, ...(bizData === undefined ? {} : { bizData }) },
      });
    expect(readSmartLifeMessage(business('online', { devId: 'd1' }))).toStrictEqual([
      { kind: 'online', deviceId: 'd1' },
    ]);
    expect(readSmartLifeMessage(business('bindUser', { devId: 'd1' }))).toStrictEqual([
      { kind: 'inventory_changed', deviceId: 'd1', bizCode: 'bindUser' },
    ]);
    expect(readSmartLifeMessage(business('somethingElse', { devId: 'd1' }))).toStrictEqual([
      { kind: 'other', bizCode: 'somethingElse' },
    ]);
    expect(readSmartLifeMessage(business('online'))).toStrictEqual([
      { kind: 'other', bizCode: 'online' },
    ]);
  });
});
