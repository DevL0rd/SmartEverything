import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HARNESS_BOOT } from '../src/process/boot';

function boot(hubUrl: string): Record<string, unknown> {
  return {
    type: 'harness_boot',
    protocol: 1,
    device_id: randomUUID(),
    generation: randomUUID(),
    runtime_instance: randomUUID(),
    name: 'Desk',
    hub_url: hubUrl,
    token: 'token',
    home_directory: '/home/test',
    state_directory: '/home/test/.state',
    platform: 'linux',
    permission: { sandbox: 'danger-full-access', approval: 'never' },
  };
}

describe('starting a computer harness', () => {
  it.each(['http://192.168.1.20:8788', 'http://hub.local:8788', 'https://hub.example.test'])(
    'accepts the hub address %s the computer is paired with',
    (hubUrl) => {
      expect(HARNESS_BOOT.parse(boot(hubUrl)).hub_url).toBe(hubUrl);
    },
  );

  it('refuses an address that is not a URL', () => {
    expect(() => HARNESS_BOOT.parse(boot('hub'))).toThrow();
  });
});
