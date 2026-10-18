import type * as OperatingSystem from 'node:os';
import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { interfaceFor, wizInterfaces } from '../../../src/plugins/builtin/wiz/interfaces';

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof OperatingSystem>()),
  networkInterfaces: vi.fn(),
}));

type Entries = ReturnType<typeof networkInterfaces>;

function entry(
  address: string,
  cidr: string | null,
  options: { internal?: boolean; family?: 'IPv4' | 'IPv6' } = {},
): NonNullable<Entries[string]>[number] {
  const family = options.family ?? 'IPv4';
  const common = { address, internal: options.internal ?? false, mac: '00:00:00:00:00:00', cidr };
  return family === 'IPv4'
    ? { ...common, family, netmask: '255.255.255.0' }
    : { ...common, family, netmask: 'ffff:ffff:ffff:ffff::', scopeid: 0 };
}

afterEach(() => {
  vi.mocked(networkInterfaces).mockReset();
});

describe('WiZ network interfaces', () => {
  it('lists the broadcast address of each external IPv4 network, whatever its range', () => {
    vi.mocked(networkInterfaces).mockReturnValue({
      lo: [entry('127.0.0.1', '127.0.0.1/8', { internal: true })],
      eth0: [
        entry('192.168.1.20', '192.168.1.20/24'),
        entry('fe80::1', 'fe80::1/64', { family: 'IPv6' }),
      ],
      tailnet: [entry('100.64.3.9', '100.64.3.9/22')],
      wide: [entry('10.1.2.3', '10.1.2.3/16')],
      odd: [entry('172.16.5.77', '172.16.5.77/28')],
      down: [entry('169.254.1.1', null)],
    });
    expect(wizInterfaces()).toEqual([
      { address: '192.168.1.20', prefix: 24, broadcast: '192.168.1.255' },
      { address: '100.64.3.9', prefix: 22, broadcast: '100.64.3.255' },
      { address: '10.1.2.3', prefix: 16, broadcast: '10.1.255.255' },
      { address: '172.16.5.77', prefix: 28, broadcast: '172.16.5.79' },
    ]);
  });

  it('finds the network a light is on', () => {
    const networks = [
      { address: '192.168.1.20', prefix: 24, broadcast: '192.168.1.255' },
      { address: '100.64.3.9', prefix: 22, broadcast: '100.64.3.255' },
    ];
    expect(interfaceFor('192.168.1.77', networks)?.address).toBe('192.168.1.20');
    expect(interfaceFor('100.64.1.5', networks)?.address).toBe('100.64.3.9');
    expect(interfaceFor('192.168.2.77', networks)).toBeUndefined();
  });
});
