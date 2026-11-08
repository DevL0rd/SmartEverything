import { describe, expect, it } from 'vitest';
import { neighborMacs } from '../../src/firewall/neighbors';
import { fakeSystem } from './fake-system';

const ARP = [
  'IP address       HW type     Flags       HW address            Mask     Device',
  '192.168.50.141   0x1         0x2         b8:88:80:d7:19:ac     *        enp108s0',
  '192.168.50.191   0x1         0x0         00:00:00:00:00:00     *        enp108s0',
  '',
].join('\n');

describe('neighborMacs', () => {
  it('reads resolved entries of the Linux ARP table and skips incomplete ones', async () => {
    const table = await neighborMacs(fakeSystem({ files: { '/proc/net/arp': ARP } }));
    expect([...table]).toStrictEqual([['192.168.50.141', 'b8:88:80:d7:19:ac']]);
  });

  it('reads macOS arp output, padding short octets', async () => {
    const system = {
      ...fakeSystem({
        programs: {
          'arp -an': {
            code: 0,
            stdout:
              '? (192.168.50.141) at b8:88:80:d7:9:ac on en0 ifscope [ethernet]\n? (192.168.50.5) at (incomplete) on en0\n',
          },
        },
      }),
      platform: 'darwin',
    } as const;
    expect([...(await neighborMacs(system))]).toStrictEqual([
      ['192.168.50.141', 'b8:88:80:d7:09:ac'],
    ]);
  });

  it('reads Windows arp output with dashes', async () => {
    const system = {
      ...fakeSystem({
        programs: {
          'arp -a': {
            code: 0,
            stdout: '  192.168.50.141        b8-88-80-d7-19-ac     dynamic\n',
          },
        },
      }),
      platform: 'win32',
    } as const;
    expect([...(await neighborMacs(system))]).toStrictEqual([
      ['192.168.50.141', 'b8:88:80:d7:19:ac'],
    ]);
  });

  it('is empty when the table cannot be read', async () => {
    expect((await neighborMacs(fakeSystem())).size).toBe(0);
  });
});
