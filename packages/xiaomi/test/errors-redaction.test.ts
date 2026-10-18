import { describe, expect, it } from 'vitest';
import { parseCloudEnvelope } from '../src/cloud-envelope';
import { parseActionResult, parsePropertyReadings } from '../src/miot';
import { parseResponse } from '../src/rpc';

const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const REQUEST = { id: 7, method: 'get_properties', params: [] } as const;

function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (cause) {
    if (cause instanceof Error) {
      return cause.message;
    }
  }
  throw new Error('expected the call to throw');
}

describe('reply text never reaches an error message', () => {
  it('a device reply of the wrong shape or that is not JSON', () => {
    expect(messageOf(() => parseResponse(REQUEST, `{"id":7,"token":"${SECRET}"}`))).toBe(
      'The miIO packet was refused: expected an RPC result or error, received a reply of another shape.',
    );
    expect(messageOf(() => parseResponse(REQUEST, `token ${SECRET}`))).toBe(
      'The miIO packet was refused: expected a JSON body, received text that is not JSON (SyntaxError).',
    );
  });

  it('MIoT results of the wrong shape', () => {
    const reply = { token: SECRET };
    expect(messageOf(() => parsePropertyReadings(reply))).not.toContain(SECRET);
    expect(messageOf(() => parseActionResult({ siid: 1, aiid: 1 }, SECRET))).not.toContain(SECRET);
  });

  it('a cloud reply that is not JSON or has no code', () => {
    expect(messageOf(() => parseCloudEnvelope('/home/device_list', `<html>${SECRET}`))).toBe(
      'The Xiaomi cloud refused /home/device_list with code -1: the reply was not JSON (SyntaxError).',
    );
    expect(
      messageOf(() => parseCloudEnvelope('/home/device_list', `{"result":{"token":"${SECRET}"}}`)),
    ).toBe(
      'The Xiaomi cloud refused /home/device_list with code -1: the reply had no numeric code.',
    );
  });
});
