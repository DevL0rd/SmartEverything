import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  TUYA_ERROR_KINDS,
  TuyaCloudError,
  TuyaResponseError,
  errorKindOf,
  readEnvelope,
} from '../src';

function failureOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
}

describe('cloud response envelopes', () => {
  it('names every error kind', () => {
    expect(TUYA_ERROR_KINDS).toStrictEqual([
      'credentials',
      'token',
      'permission',
      'device_offline',
      'refused',
      'unsupported_device',
      'other',
    ]);
  });

  it('classifies a code given as text like the number it spells', () => {
    expect(errorKindOf('1004')).toBe('credentials');
    expect(errorKindOf('not-a-code')).toBe('other');
  });

  it('classifies every documented error code and nothing else', () => {
    expect([1004, 1010, 1106, 2001, 2008, 2009, 500, 28841002].map(errorKindOf)).toStrictEqual([
      'credentials',
      'token',
      'permission',
      'device_offline',
      'refused',
      'unsupported_device',
      'other',
      'other',
    ]);
  });

  it('returns the parsed result of a success', () => {
    expect(
      readEnvelope('listing', z.array(z.number()), { success: true, result: [1, 2], t: 1 }),
    ).toStrictEqual([1, 2]);
  });

  it('turns a failure into a named error carrying the code and message', () => {
    const error = failureOf(() =>
      readEnvelope('getting a token', z.unknown(), {
        success: false,
        code: 1004,
        msg: 'sign invalid',
        t: 1,
      }),
    );
    expect(error).toBeInstanceOf(TuyaCloudError);
    expect(error).toMatchObject({
      name: 'TuyaCloudError',
      operation: 'getting a token',
      code: 1004,
      detail: 'sign invalid',
      kind: 'credentials',
      message: 'Tuya cloud refused getting a token: code 1004, "sign invalid".',
    });
  });

  it('refuses a body that is neither a success nor a failure', () => {
    const error = failureOf(() => readEnvelope('listing', z.unknown(), { success: 'yes' }));
    expect(error).toBeInstanceOf(TuyaResponseError);
    expect(error).toMatchObject({
      name: 'TuyaResponseError',
      operation: 'listing',
      message:
        'Tuya cloud answered listing with a body that is not a success or failure envelope of the expected shape: ✖ Invalid input: expected true\n  → at success\n✖ Invalid input: expected nonoptional, received undefined\n  → at result.',
    });
  });

  it('refuses a success whose result has the wrong shape, naming the path', () => {
    const error = failureOf(() =>
      readEnvelope('listing', z.object({ list: z.array(z.string()) }), {
        success: true,
        result: { list: [3] },
      }),
    );
    expect(error).toMatchObject({
      problems: '✖ Invalid input: expected string, received number\n  → at list[0]',
    });
  });
});
