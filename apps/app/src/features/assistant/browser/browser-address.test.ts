import { describe, expect, it } from 'vitest';
import { browserAddress } from './browser-address';

describe('typed browser addresses', () => {
  it.each([
    '192.168.1.1',
    'http://homeassistant.local:8123',
    'localhost:5173',
    'http://nas.home/files',
  ])('opens %s when the person types it', (typed) => {
    expect(browserAddress(typed, null, [], 'any-host').kind).toBe('public');
  });

  it.each(['192.168.1.1', 'http://homeassistant.local:8123', 'localhost:5173'])(
    'keeps %s away from the assistant',
    (typed) => {
      expect(browserAddress(typed, null, [], 'public-hosts')).toEqual({
        kind: 'rejected',
        reason: 'This service has not been shared with this chat.',
      });
    },
  );

  it('opens a plain http site for both', () => {
    expect(browserAddress('http://example.com/a', null, [], 'public-hosts')).toEqual({
      kind: 'public',
      url: 'http://example.com/a',
    });
  });

  it('rejects credentials and non-web schemes with the right reason', () => {
    expect(browserAddress('https://me:pw@example.com', null, [], 'any-host').kind).toBe('rejected');
    expect(browserAddress('ftp://example.com/file', null, [], 'any-host')).toEqual({
      kind: 'rejected',
      reason: 'Enter an http or https web address.',
    });
  });
});
