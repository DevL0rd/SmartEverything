import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MiioDeviceError,
  MiioPacketError,
  MiotRefusedError,
  actionParams,
  checkPropertyWrites,
  chunk,
  encodeRequest,
  getPropertiesParams,
  nextMessageId,
  parseActionResult,
  parsePropertyReadings,
  parseResponse,
  responseId,
  setPropertiesParams,
} from '../src';

const request = { id: 7, method: 'get_properties', params: [] };

describe('JSON-RPC message ids', () => {
  it('count up by one and wrap back to one after the largest 32-bit signed id', () => {
    expect(nextMessageId(0)).toBe(1);
    expect(nextMessageId(41)).toBe(42);
    expect(nextMessageId(2_147_483_646)).toBe(2_147_483_647);
    expect(nextMessageId(2_147_483_647)).toBe(1);
  });
});

describe('RPC requests and responses', () => {
  it('encode the id, method and params in order', () => {
    expect(encodeRequest({ id: 3, method: 'set_power', params: ['on'] })).toBe(
      '{"id":3,"method":"set_power","params":["on"]}',
    );
  });

  it('return the result of the matching reply', () => {
    expect(parseResponse(request, '{"id":7,"result":["ok"]}')).toStrictEqual(['ok']);
  });

  it('read the id of any reply that has one', () => {
    expect(responseId('{"id":12,"result":0}')).toBe(12);
    expect(responseId('{"result":0}')).toBeNull();
    expect(() => responseId('nope')).toThrow(MiioPacketError);
  });

  it('turn a device error into a named error with its code and message', () => {
    expect(() =>
      parseResponse(request, '{"id":7,"error":{"code":-9999,"message":"user ack timeout"}}'),
    ).toThrow(new MiioDeviceError('get_properties', -9999, 'user ack timeout'));
  });

  it('refuse a reply to another request', () => {
    expect(() => parseResponse(request, '{"id":8,"result":0}')).toThrow(
      new MiioPacketError('message id 7', '8'),
    );
  });

  it('refuse text that is not JSON or not a reply', () => {
    expect(() => parseResponse(request, 'garbage')).toThrow(
      /expected a JSON body, received garbage/,
    );
    expect(() => parseResponse(request, '{"id":7}')).toThrow(
      new MiioPacketError('an RPC result or error', '{"id":7}'),
    );
  });
});

describe('MIoT payloads', () => {
  it('build get_properties, set_properties and action params', () => {
    expect(getPropertiesParams('42', [{ siid: 2, piid: 1 }])).toStrictEqual([
      { did: '42', siid: 2, piid: 1 },
    ]);
    expect(setPropertiesParams('42', [{ siid: 2, piid: 1, value: true }])).toStrictEqual([
      { did: '42', siid: 2, piid: 1, value: true },
    ]);
    expect(actionParams('42', { siid: 4, aiid: 1 }, [3])).toStrictEqual({
      did: '42',
      siid: 4,
      aiid: 1,
      in: [3],
    });
  });

  it('parse readings, keeping failures with their code', () => {
    expect(
      parsePropertyReadings([
        { did: '42', siid: 2, piid: 1, code: 0, value: true },
        { did: '42', siid: 2, piid: 2, code: -4004 },
        { did: '42', siid: 2, piid: 3, code: 0 },
        { did: '42', siid: 2, piid: 4, code: -1, value: 5 },
      ]),
    ).toStrictEqual([
      { siid: 2, piid: 1, ok: true, value: true },
      { siid: 2, piid: 2, ok: false, code: -4004 },
      { siid: 2, piid: 3, ok: false, code: 0 },
      { siid: 2, piid: 4, ok: false, code: -1 },
    ]);
    expect(() => parsePropertyReadings({})).toThrow(
      new MiioPacketError('a list of property results', '{}'),
    );
  });

  it('accept writes answered with code 0 or 1 and refuse any other code', () => {
    expect(() => {
      checkPropertyWrites([
        { siid: 2, piid: 1, code: 0 },
        { siid: 2, piid: 2, code: 1 },
      ]);
    }).not.toThrow();
    expect(() => {
      checkPropertyWrites([{ siid: 2, piid: 3, code: -4003 }]);
    }).toThrow(new MiotRefusedError('property', 2, 3, -4003));
    expect(() => {
      checkPropertyWrites(null);
    }).toThrow(new MiioPacketError('a list of property write results', 'null'));
  });

  it('return the out values of an accepted action and refuse the rest', () => {
    const action = { siid: 4, aiid: 1 };
    expect(parseActionResult(action, { code: 0, out: [1] })).toStrictEqual([1]);
    expect(parseActionResult(action, { code: 1 })).toStrictEqual([]);
    expect(() => parseActionResult(action, { code: -1 })).toThrow(
      new MiotRefusedError('action', 4, 1, -1),
    );
    expect(() => parseActionResult(action, 'x')).toThrow(
      new MiioPacketError('an action result', '"x"'),
    );
  });

  it('chunk any list into consecutive slices of at most the given size', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.integer({ min: 1, max: 20 }), (items, size) => {
        const chunks = chunk(items, size);
        expect(chunks.flat()).toStrictEqual(items);
        expect(chunks.every((part) => part.length > 0 && part.length <= size)).toBe(true);
        expect(chunks.slice(0, -1).every((part) => part.length === size)).toBe(true);
      }),
    );
  });
});

describe('MiotRefusedError', () => {
  it('names the subject, address and code', () => {
    expect(new MiotRefusedError('property', 2, 3, -4).message).toBe(
      'The device answered property 2.3 with code -4, expected 0 or 1.',
    );
  });
});
