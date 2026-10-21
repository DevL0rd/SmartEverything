import { describe, expect, it } from 'vitest';
import { browserAddress } from './browser-address';

describe('typed browser addresses', () => {
  it.each([
    '192.168.1.1',
    'http://homeassistant.local:8123',
    'localhost:5173',
    'http://nas.home/files',
    'http://example.com/a',
  ])('opens %s for the person and the assistant', (typed) => {
    expect(browserAddress(typed).kind).toBe('public');
  });

  it('rejects credentials and non-web schemes with the right reason', () => {
    expect(browserAddress('https://me:pw@example.com').kind).toBe('rejected');
    expect(browserAddress('ftp://example.com/file')).toEqual({
      kind: 'rejected',
      reason: 'Enter an http or https web address.',
    });
  });
});
