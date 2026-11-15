import { describe, expect, it } from 'vitest';
import { REDACTED, shippedRecord, type LogRecord } from '../src/index';
import { isSecretName } from '../src/redaction';

function record(payload: LogRecord['payload']): LogRecord {
  return {
    timestamp: '2026-11-15T07:00:00.000Z',
    runtime: 'hub',
    scope: 'hub.node',
    event: 'sample.failed',
    level: 'error',
    payload,
  };
}

describe('shipping a log record', () => {
  it('hides secret fields at any depth and keeps the rest', () => {
    const shipped = shippedRecord(
      record({
        password: 'hunter2',
        attempt: 2,
        request: { headers: { authorization: 'Bearer abc', accept: 'json' }, nodeToken: 't' },
        keys: ['a', 'b'],
        list: [{ apiKey: 'k', name: 'n' }],
      }),
      'server',
    );
    expect(shipped.payload).toEqual({
      password: REDACTED,
      attempt: 2,
      request: { headers: { authorization: REDACTED, accept: 'json' }, nodeToken: REDACTED },
      keys: ['a', 'b'],
      list: [{ apiKey: REDACTED, name: 'n' }],
    });
    expect(JSON.stringify(shipped)).not.toContain('hunter2');
  });
});

describe('secret field names', () => {
  it('knows secrets by their words, in any case style', () => {
    for (const name of [
      'password',
      'token',
      'node_token',
      'clientSecret',
      'Authorization',
      'api_key',
      'privateKey',
      'key',
      'sessionCookie',
      'passphrase',
    ]) {
      expect(isSecretName(name)).toBe(true);
    }
  });

  it('leaves ordinary names alone', () => {
    for (const name of ['keys', 'keyboardLayout', 'tokens_used', 'name', 'monkey', 'deviceId']) {
      expect(isSecretName(name)).toBe(false);
    }
  });
});
