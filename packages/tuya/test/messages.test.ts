import { createCipheriv, createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CloudMessageError,
  MESSAGE_ACK_TIMEOUT_MS,
  MESSAGE_TOPIC,
  acknowledgement,
  messageConsumerUrl,
  messagePassword,
  readMessageFrame,
} from '../src';

const SECRET = '0123456789abcdefFEDCBA9876543210';
const KEY = Buffer.from(SECRET.slice(8, 24));

function md5(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

function ecb(text: string): string {
  const cipher = createCipheriv('aes-128-ecb', KEY, null);
  return Buffer.concat([cipher.update(text), cipher.final()]).toString('base64');
}

function gcm(text: string): string {
  const nonce = Buffer.from('abcdefghijkl');
  const cipher = createCipheriv('aes-128-gcm', KEY, nonce);
  const sealed = Buffer.concat([cipher.update(text), cipher.final()]);
  return Buffer.concat([nonce, sealed, cipher.getAuthTag()]).toString('base64');
}

function frame(source: object, properties?: Record<string, string>): string {
  return JSON.stringify({
    messageId: 'CAAQAA==',
    payload: Buffer.from(JSON.stringify(source)).toString('base64'),
    ...(properties === undefined ? {} : { properties }),
    publishTime: '2026-10-08T10:00:00.000Z',
  });
}

const STATUS = {
  dataId: 'x',
  devId: 'bf01',
  productKey: 'p',
  status: [{ code: 'switch_1', value: true, t: 1, '1': true }],
};

describe('cloud message service', () => {
  it('derives the documented password from the access id and secret', () => {
    expect(messagePassword('id', 'secret')).toBe(md5(`id${md5('secret')}`).slice(8, 24));
    expect(messagePassword('id', 'secret')).toHaveLength(16);
  });

  it('subscribes to the event topic with failover and acknowledgement timeout', () => {
    expect(MESSAGE_TOPIC).toBe('event');
    expect(MESSAGE_ACK_TIMEOUT_MS).toBe(3000);
    expect(messageConsumerUrl('eu', 'abc')).toBe(
      'wss://mqe.tuyaeu.com:8285/ws/v2/consumer/persistent/abc/out/event/abc-sub?ackTimeoutMillis=3000&subscriptionType=Failover',
    );
  });

  it('acknowledges a message by its id', () => {
    expect(acknowledgement('CAAQAA==')).toBe('{"messageId":"CAAQAA=="}');
  });

  it('reads an ECB status report', () => {
    expect(
      readMessageFrame(
        frame({ data: ecb(JSON.stringify(STATUS)), protocol: 4, pv: '2.0', t: 1 }),
        SECRET,
      ),
    ).toStrictEqual({
      messageId: 'CAAQAA==',
      message: { kind: 'status', deviceId: 'bf01', items: [{ code: 'switch_1', value: true }] },
    });
  });

  it('reads a GCM message carried in encryptPayload', () => {
    const body = { bizCode: 'online', bizData: { devId: 'bf02', time: 1 }, ts: 1 };
    expect(
      readMessageFrame(
        frame({ encryptPayload: gcm(JSON.stringify(body)), protocol: 20 }, { em: 'aes_gcm' }),
        SECRET,
      ).message,
    ).toStrictEqual({ kind: 'online', deviceId: 'bf02' });
  });

  it('reads offline messages and keeps other business codes for logging', () => {
    expect(
      readMessageFrame(
        frame({ data: ecb(JSON.stringify({ bizCode: 'offline', devId: 'bf03' })) }),
        SECRET,
      ).message,
    ).toStrictEqual({
      kind: 'offline',
      deviceId: 'bf03',
    });
    expect(
      readMessageFrame(
        frame({ data: ecb(JSON.stringify({ bizCode: 'nameUpdate', devId: 'bf03' })) }),
        SECRET,
      ).message,
    ).toStrictEqual({
      kind: 'other',
      bizCode: 'nameUpdate',
    });
    expect(
      readMessageFrame(frame({ data: ecb(JSON.stringify({ bizCode: 'online' })) }), SECRET).message,
    ).toStrictEqual({
      kind: 'other',
      bizCode: 'online',
    });
    expect(
      readMessageFrame(frame({ data: ecb(JSON.stringify({ status: [] })) }), SECRET).message,
    ).toStrictEqual({
      kind: 'other',
      bizCode: 'none',
    });
  });

  it('keeps the message id on a failure once the frame names one, so it can still be acknowledged', () => {
    const failure = (text: string): unknown => {
      try {
        readMessageFrame(text, SECRET);
      } catch (error) {
        return error;
      }
      return null;
    };
    expect(failure('nope')).toMatchObject({ messageId: null });
    expect(failure('{"payload":"x"}')).toMatchObject({ messageId: null });
    expect(failure('{"messageId":"","payload":"x"}')).toMatchObject({ messageId: null });
    expect(failure('{"messageId":"m1"}')).toMatchObject({ messageId: 'm1' });
    expect(failure(JSON.stringify({ messageId: 'm2', payload: '***' }))).toMatchObject({
      messageId: 'm2',
    });
    expect(failure(frame({ protocol: 4 }))).toMatchObject({ messageId: 'CAAQAA==' });
    expect(
      failure(JSON.stringify({ messageId: 'm3', payload: Buffer.from('nope').toString('base64') })),
    ).toMatchObject({
      messageId: 'm3',
    });
    expect(failure(frame({ data: 'AAAA' }))).toMatchObject({ messageId: 'CAAQAA==' });
    expect(failure(frame({ data: ecb('nope') }))).toMatchObject({
      messageId: 'CAAQAA==',
    });
    expect(failure(frame({ data: ecb('[1]') }))).toMatchObject({ messageId: 'CAAQAA==' });
  });

  it('refuses frames it cannot read, saying which layer failed', () => {
    expect(() => readMessageFrame(frame({ data: ecb('nope') }), SECRET)).toThrow(
      /: the message body is not JSON \(SyntaxError/,
    );
    expect(() =>
      readMessageFrame(
        JSON.stringify({ messageId: 'm', payload: Buffer.from('nope').toString('base64') }),
        SECRET,
      ),
    ).toThrow(/: the payload is not JSON \(SyntaxError/);
    expect(() => readMessageFrame('nope', SECRET)).toThrow(
      /^A Tuya cloud message could not be read: the frame is not JSON/,
    );
    expect(() => readMessageFrame('{}', SECRET)).toThrow(
      'A Tuya cloud message could not be read: the frame does not fit: messageId: Invalid input: expected string, received undefined; payload: Invalid input: expected string, received undefined.',
    );
    expect(() =>
      readMessageFrame(JSON.stringify({ messageId: 'm', payload: '***' }), SECRET),
    ).toThrow(/its payload is not base64 text/);
    expect(() => readMessageFrame(frame({ protocol: 4 }), SECRET)).toThrow(
      /the payload does not fit/,
    );
    expect(() => readMessageFrame(frame({ data: 'AAAA' }), SECRET)).toThrow(
      /its data could not be decrypted/,
    );
    expect(() => readMessageFrame(frame({ data: ecb('[1]') }), SECRET)).toThrow(
      /the message body does not fit/,
    );
    expect(() =>
      readMessageFrame(
        JSON.stringify({
          messageId: 'm',
          payload: Buffer.from([0xff, 0x7b, 0x7d]).toString('base64'),
        }),
        SECRET,
      ),
    ).toThrow(/its payload is not base64 text \(TypeError/);
    const invalidUtf8 = createCipheriv('aes-128-ecb', KEY, null);
    const sealed = Buffer.concat([
      invalidUtf8.update(Buffer.from([0xff, 0x7b, 0x7d])),
      invalidUtf8.final(),
    ]).toString('base64');
    expect(() => readMessageFrame(frame({ data: sealed }), SECRET)).toThrow(
      /its data could not be decrypted \(TypeError/,
    );
    expect(new CloudMessageError('x', null)).toMatchObject({
      name: 'CloudMessageError',
      reason: 'x',
      messageId: null,
    });
  });
});
