import { randomUUID } from 'node:crypto';
import { IncomingMessage, type IncomingHttpHeaders } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { parseExpoRequest } from '../../src/app-updates/expo-request';

function request(headers: IncomingHttpHeaders): IncomingMessage {
  const made = new IncomingMessage(new Socket());
  made.headers = headers;
  return made;
}

const KEY = `${randomUUID()}.${'A'.repeat(43)}`;

const VALID = {
  'expo-protocol-version': '1',
  'expo-platform': 'android',
  'expo-runtime-version': 'abc',
  'expo-extra-params': `channel="dev", key="${KEY}"`,
};

function refusal(headers: IncomingHttpHeaders): unknown {
  try {
    parseExpoRequest(request(headers));
  } catch (cause) {
    return cause;
  }
  return null;
}

describe('reading the expo update headers', () => {
  it('reads the required headers and leaves the optional ones empty', () => {
    expect(parseExpoRequest(request(VALID))).toStrictEqual({
      runtimeVersion: 'abc',
      channel: 'dev',
      key: KEY,
      download: null,
      currentUpdateId: null,
      expectsSignature: false,
    });
  });

  it('reads the update ids and the signature expectation', () => {
    const current = randomUUID();
    expect(
      parseExpoRequest(
        request({
          ...VALID,
          'expo-current-update-id': current,
          'expo-expect-signature': 'sig, keyid="main", alg="rsa-v1_5-sha256"',
        }),
      ),
    ).toMatchObject({
      currentUpdateId: current,
      expectsSignature: true,
    });
  });

  it('reads a missing key as no key so the route can refuse it as unauthorized', () => {
    expect(
      parseExpoRequest(request({ ...VALID, 'expo-extra-params': 'channel="release"' })),
    ).toMatchObject({ channel: 'release', key: null });
  });

  it('reads the selected update id for a download', () => {
    const id = randomUUID();
    const headers = {
      ...VALID,
      'expo-extra-params': `${VALID['expo-extra-params']}, download="${id}"`,
    };
    expect(parseExpoRequest(request(headers)).download).toBe(id);
  });

  it('never echoes the extra params, which carry the key, in a refusal', () => {
    const failure = refusal({ ...VALID, 'expo-extra-params': `channel="beta", key="${KEY}"` });
    expect(failure).toMatchObject({
      code: 'invalid_request',
      reason: 'received an unreadable value',
    });
    expect(JSON.stringify(failure) + String(failure)).not.toContain(KEY);
  });

  it.each([
    ['expo-protocol-version', '0'],
    ['expo-platform', 'ios'],
    ['expo-extra-params', 'channel="beta"'],
    ['expo-extra-params', 'channel=dev'],
    ['expo-extra-params', `channel="dev", key="${KEY}", user="x"`],
    ['expo-extra-params', 'key="not-a-key", channel="dev"'],
    ['expo-extra-params', undefined],
    ['expo-runtime-version', ''],
    ['expo-current-update-id', 'not-a-uuid'],
    ['expo-runtime-version', undefined],
  ])('answers 400 naming the header %s when it is %s', (name, value) => {
    const failure = refusal({ ...VALID, [name]: value });
    expect(failure).toMatchObject({ code: 'invalid_request', status: 400 });
    expect(failure instanceof Error ? failure.message : '').toContain(
      `The header ${name} is not valid`,
    );
  });

  it('refuses a header sent twice', () => {
    expect(refusal({ ...VALID, 'expo-runtime-version': ['a', 'b'] })).toMatchObject({
      reason: 'received the header more than once',
    });
  });
});
