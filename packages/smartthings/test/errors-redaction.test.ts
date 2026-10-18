import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { outcomesOf } from '../src/command-batching';
import { issuePaths, parsed, SmartThingsResponseError } from '../src/errors';
import { parseTokenResponse } from '../src/oauth';

const NOW = new Date('2026-10-08T12:00:00.000Z');

function failureOf(run: () => unknown): Error {
  try {
    run();
  } catch (cause) {
    if (cause instanceof Error) {
      return cause;
    }
  }
  throw new Error('expected the call to throw');
}

describe('credentials never reach an error message', () => {
  it('a token response of another type reports its field names, never a token value', () => {
    const error = failureOf(() =>
      parseTokenResponse(
        {
          access_token: 'access-secret',
          token_type: 'mac',
          refresh_token: 'refresh-secret',
          expires_in: 86399,
          scope: 'r:devices:*',
        },
        NOW,
      ),
    );
    expect(error).toBeInstanceOf(SmartThingsResponseError);
    expect(error.message).toBe(
      'The SmartThings token response did not have the expected shape: token_type.',
    );
    expect(error).toMatchObject({
      received: ['access_token', 'token_type', 'refresh_token', 'expires_in', 'scope'],
    });
    for (const text of [error.message, String(error), error.stack ?? '']) {
      expect(text).not.toContain('access-secret');
      expect(text).not.toContain('refresh-secret');
    }
  });

  it('a token response that is not an object reports no field names', () => {
    const error = failureOf(() => parseTokenResponse('access-secret', NOW));
    expect(error).toMatchObject({ received: [] });
    expect(error.message).not.toContain('access-secret');
  });

  it('keeps the received value as a structured field and names only the failing paths', () => {
    const error = failureOf(() =>
      parsed(
        z.object({ a: z.object({ b: z.string() }), c: z.number() }),
        { a: {}, c: 'x' },
        'thing',
      ),
    );
    expect(error.message).toBe('The SmartThings thing did not have the expected shape: a.b, c.');
    expect(error).toMatchObject({ received: { a: {}, c: 'x' } });
  });

  it('names the whole value when the root fails and each path once', () => {
    const schema = z.array(z.string());
    const result = schema.safeParse('x');
    expect(result.success ? '' : issuePaths(result.error)).toBe('the whole value');
    const twice = z.object({ a: z.string().min(2).regex(/^z/) }).safeParse({ a: 'x' });
    expect(twice.success ? '' : issuePaths(twice.error)).toBe('a');
  });

  it('a malformed command response does not echo what was received', () => {
    const error = failureOf(() => outcomesOf({ results: 'password-1234' }, 1));
    expect(error.message).toBe(
      'The SmartThings command response did not have the expected shape: results.',
    );
  });
});
