import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  HEAD_KEY,
  IR_CODE,
  IR_CODE_FORMATS,
  IrCodeError,
  LIBRARY_KEY,
  MAX_PULSE_MICROSECONDS,
  canonicalIrCode,
  headKeyToPulses,
  learnedCodeFromHex,
  parseHeadKey,
  parseLibraryKey,
  pulsesFromBase64,
  pulsesFromHex,
  pulsesToBase64,
  pulsesToHex,
} from '../src';

const HEAD_TYPE_1 = '010ED80000000000030015004000 80'.replaceAll(' ', '');
const HEAD_TYPE_2 = '020ED80000000000030015004000 80'.replaceAll(' ', '');
const ZERO_1 = [553, 553];
const ONE_1 = [553, 1684];
const ZERO_2 = [553, 1684];
const ONE_2 = [553, 3368];

function oracleBase64(pulses: readonly number[]): string {
  const bytes = Buffer.alloc(pulses.length * 2);
  pulses.forEach((pulse, index) => bytes.writeUInt16LE(pulse, index * 2));
  return bytes.toString('base64');
}

const pulseTrain = fc.array(fc.integer({ min: 1, max: MAX_PULSE_MICROSECONDS }), {
  minLength: 1,
  maxLength: 300,
});

describe('IR code formats', () => {
  it('names the three stored formats', () => {
    expect(IR_CODE_FORMATS).toStrictEqual(['pulses', 'head_key', 'library']);
    expect(IR_CODE.safeParse({ format: 'pulses', code: '' }).success).toBe(false);
    expect(MAX_PULSE_MICROSECONDS).toBe(65535);
  });

  it('encodes pulse trains as little-endian 16-bit base64', () => {
    expect(pulsesToBase64([9000, 4500, 560])).toBe('KCOUETAC');
    fc.assert(
      fc.property(pulseTrain, (pulses) => {
        expect(pulsesToBase64(pulses)).toBe(oracleBase64(pulses));
        expect(pulsesFromBase64(pulsesToBase64(pulses))).toStrictEqual(pulses);
      }),
    );
  });

  it('strips the leading 1 some blasters prefix to a learned code', () => {
    expect(pulsesFromBase64('1KCOUETAC')).toStrictEqual([9000, 4500, 560]);
  });

  it('describes its errors with the format and reason', () => {
    expect(new IrCodeError('head_key', 'bad')).toMatchObject({
      name: 'IrCodeError',
      format: 'head_key',
      reason: 'bad',
      message: 'The head_key IR code is not valid: bad.',
    });
  });

  it('strips a leading character only when it is the 1 prefix', () => {
    expect(() => pulsesFromBase64('AKCOUETAC')).toThrow(IrCodeError);
    expect(pulsesFromBase64('1AA=')).toStrictEqual([212]);
  });

  it('refuses a learned code that is not a whole pulse train', () => {
    expect(() => pulsesFromBase64('KCOU')).toThrow(
      new IrCodeError('pulses', 'it holds 3 bytes, not a whole number of pulses'),
    );
    expect(() => pulsesFromBase64('')).toThrow('it holds 0 bytes');
    expect(() => pulsesFromBase64('***')).toThrow(/it is not base64 \(SyntaxError/);
    expect(() => pulsesFromBase64('***')).toThrow(expect.objectContaining({ format: 'pulses' }));
  });

  it('refuses pulses that do not fit 16 bits or are not positive integers', () => {
    expect(() => pulsesToBase64([])).toThrow(IrCodeError);
    expect(() => pulsesToBase64([0])).toThrow(
      'The pulses IR code is not valid: pulse lengths must be 1 to 65535 microseconds, received [0].',
    );
    expect(() => pulsesToBase64([65536])).toThrow(IrCodeError);
    expect(() => pulsesToBase64([1.5])).toThrow(IrCodeError);
    expect(pulsesToBase64([1, 65535])).toBe(oracleBase64([1, 65535]));
  });

  it('converts the cloud hex form both ways', () => {
    expect(pulsesFromHex('c4223011')).toStrictEqual([8900, 4400]);
    expect(pulsesToHex([8900, 4400])).toBe('c4223011');
    fc.assert(
      fc.property(pulseTrain, (pulses) => {
        expect(pulsesFromHex(pulsesToHex(pulses))).toStrictEqual(pulses);
      }),
    );
    expect(() => pulsesFromHex('c422301')).toThrow(
      'The pulses IR code is not valid: a hex pulse train is a non-empty run of 4-digit groups.',
    );
    expect(() => pulsesFromHex('')).toThrow(IrCodeError);
    expect(() => pulsesFromHex('zzzz')).toThrow(IrCodeError);
    expect(learnedCodeFromHex('c4223011')).toStrictEqual({
      format: 'pulses',
      code: oracleBase64([8900, 4400]),
    });
  });
});

describe('head and key codes', () => {
  it('expands symbols and a counted bit field with type 1 timings', () => {
    expect(headKeyToPulses({ head: HEAD_TYPE_1, key: '01@#0003A0$' })).toStrictEqual([
      553,
      1684,
      ...ONE_1,
      ...ZERO_1,
      ...ONE_1,
      3368,
    ]);
  });

  it('expands a hex-run bit field and pads an odd run', () => {
    expect(headKeyToPulses({ head: HEAD_TYPE_1, key: '010100F0' })).toStrictEqual([
      ...ONE_1,
      ...ONE_1,
      ...ONE_1,
      ...ONE_1,
      ...ZERO_1,
      ...ZERO_1,
      ...ZERO_1,
      ...ZERO_1,
    ]);
    expect(headKeyToPulses({ head: HEAD_TYPE_2, key: '010100a$' })).toStrictEqual([
      ...ONE_2,
      ...ZERO_2,
      ...ONE_2,
      ...ZERO_2,
      3368,
    ]);
  });

  it('expands runs of several bytes', () => {
    expect(headKeyToPulses({ head: HEAD_TYPE_1, key: '010100F00F' })).toStrictEqual([
      ...[ONE_1, ONE_1, ONE_1, ONE_1, ZERO_1, ZERO_1, ZERO_1, ZERO_1].flat(),
      ...[ZERO_1, ZERO_1, ZERO_1, ZERO_1, ONE_1, ONE_1, ONE_1, ONE_1].flat(),
    ]);
  });

  it('needs only two timings for a type 1 head', () => {
    expect(
      headKeyToPulses({ head: '010ED80000000000020015004000'.slice(0, 26), key: '01000280' }),
    ).toStrictEqual([...ONE_1, ...ZERO_1]);
  });

  it('accepts a head with all thirty-three timing symbols and no more', () => {
    const timings = `${'0015'.repeat(32)}0040`;
    expect(headKeyToPulses({ head: `010ED8000000000021${timings}`, key: '01@~' })).toStrictEqual([
      553, 1684,
    ]);
    expect(() =>
      headKeyToPulses({ head: `010ED8000000000022${timings}0015`, key: '01@~' }),
    ).toThrow('the head does not hold 34 timings at a known rate');
  });

  it('marks every head and key failure with its format', () => {
    for (const code of [
      { head: `03${HEAD_TYPE_1.slice(2)}`, key: '01@@' },
      { head: HEAD_TYPE_1.slice(0, -4), key: '01@@' },
      { head: '010ED80000000000010015', key: '01@@' },
      { head: '020ED800000000000200150040', key: '01@#' },
      { head: HEAD_TYPE_1, key: '01@%' },
      { head: HEAD_TYPE_1, key: '01001000' },
      { head: HEAD_TYPE_1, key: '010000' },
    ]) {
      expect(() => headKeyToPulses(code)).toThrow(expect.objectContaining({ format: 'head_key' }));
    }
  });

  it('reads a bit field header only at the start of what remains', () => {
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '01G00F0' })).toThrow(
      'The head_key IR code is not valid: expected a 4-digit bit field header at "G00F0".',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '01@A' })).toThrow(
      'The head_key IR code is not valid: expected a 4-digit bit field header at "A".',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '010100$F0' })).toThrow(
      'The head_key IR code is not valid: expected a 4-digit bit field header at "F0".',
    );
  });

  it('uses the second timing for a type 2 zero and the third for a one', () => {
    expect(headKeyToPulses({ head: HEAD_TYPE_2, key: '01000240' })).toStrictEqual([
      ...ZERO_2,
      ...ONE_2,
    ]);
  });

  it('refuses heads and keys it cannot expand, saying why', () => {
    expect(() => headKeyToPulses({ head: `03${HEAD_TYPE_1.slice(2)}`, key: '01@@' })).toThrow(
      'The head_key IR code is not valid: head type 3 is neither 1 nor 2.',
    );
    expect(() =>
      headKeyToPulses({ head: '0100000000000000030015004000 80'.replaceAll(' ', ''), key: '01@@' }),
    ).toThrow('the head does not hold 3 timings at a known rate');
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1.slice(0, -4), key: '01@@' })).toThrow(
      'the head does not hold 3 timings at a known rate',
    );
    expect(() => headKeyToPulses({ head: '010ED800000000002200', key: '01@@' })).toThrow(
      'the head does not hold 34 timings at a known rate',
    );
    expect(() =>
      headKeyToPulses({ head: '020ED8000000000002001500 15'.replaceAll(' ', ''), key: '01@#' }),
    ).toThrow('a type 2 head must define the timings its bits use');
    expect(() => headKeyToPulses({ head: '010ED80000000000010015', key: '01@@' })).toThrow(
      'a type 1 head must define the timings its bits use',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '01@%' })).toThrow(
      'expected a 4-digit bit field header at "%"',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '01001000' })).toThrow(
      'the bit field "00" is shorter than 16 bits',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '010008@@' })).toThrow(
      'the bit field "@@" is shorter than 8 bits',
    );
    expect(() => headKeyToPulses({ head: HEAD_TYPE_1, key: '010000' })).toThrow(
      'the key holds no pulses',
    );
  });

  it('parses head and key JSON and library keys', () => {
    expect(parseHeadKey(JSON.stringify({ head: HEAD_TYPE_1, key: '01@@' }))).toStrictEqual({
      head: HEAD_TYPE_1,
      key: '01@@',
    });
    expect(() => parseHeadKey('{')).toThrow(
      /^The head_key IR code is not valid: the text is not JSON \(SyntaxError/,
    );
    expect(() => parseHeadKey(JSON.stringify({ head: '01', key: '01@@' }))).toThrow(
      'The head_key IR code is not valid: the text does not fit: ✖ Invalid string: must match pattern',
    );
    expect(HEAD_KEY.safeParse({ head: HEAD_TYPE_1, key: 'zz@@' }).success).toBe(false);
    expect(HEAD_KEY.safeParse({ head: HEAD_TYPE_1, key: 'zz01@@' }).success).toBe(false);
    expect(HEAD_KEY.safeParse({ head: `zz${HEAD_TYPE_1}`, key: '01@@' }).success).toBe(false);
    expect(HEAD_KEY.safeParse({ head: `${HEAD_TYPE_1}zz`, key: '01@@' }).success).toBe(false);
    expect(HEAD_KEY.safeParse({ head: HEAD_TYPE_1, key: '01@' }).success).toBe(false);
    expect(HEAD_KEY.safeParse({ head: `${HEAD_TYPE_1}0`, key: '01@@' }).success).toBe(false);
    const library = { remoteId: 'remote', categoryId: 2, keyId: 1, key: 'power' };
    expect(parseLibraryKey(JSON.stringify(library))).toStrictEqual(library);
    expect(LIBRARY_KEY.safeParse({ ...library, keyId: 1.5 }).success).toBe(false);
    expect(() => parseLibraryKey('{}')).toThrow(expect.objectContaining({ format: 'library' }));
  });

  it('canonicalises every format it stores', () => {
    expect(canonicalIrCode({ format: 'pulses', code: '1KCOUETAC' })).toStrictEqual({
      format: 'pulses',
      code: 'KCOUETAC',
    });
    expect(
      canonicalIrCode({
        format: 'head_key',
        code: JSON.stringify({ key: '01@@', head: HEAD_TYPE_1, extra: 1 }),
      }),
    ).toStrictEqual({
      format: 'head_key',
      code: JSON.stringify({ head: HEAD_TYPE_1, key: '01@@' }),
    });
    expect(() =>
      canonicalIrCode({
        format: 'head_key',
        code: JSON.stringify({ head: HEAD_TYPE_1, key: '01%%' }),
      }),
    ).toThrow(IrCodeError);
    expect(
      canonicalIrCode({
        format: 'library',
        code: JSON.stringify({ key: 'power', keyId: 1, categoryId: 2, remoteId: 'r' }),
      }),
    ).toStrictEqual({
      format: 'library',
      code: '{"remoteId":"r","categoryId":2,"keyId":1,"key":"power"}',
    });
  });
});
