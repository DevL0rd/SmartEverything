import { describe, expect, it } from 'vitest';
import { probeLinux } from '../../src/firewall/linux';
import { fakeSystem } from './fake-system';

const UFW_FILES = {
  '/etc/ufw/ufw.conf': 'ENABLED=yes\n',
  '/etc/default/ufw': 'DEFAULT_INPUT_POLICY="DROP"\n',
  '/etc/ufw/user.rules': '',
  '/etc/ufw/user6.rules': '',
};

const FIREWALLD = {
  'firewall-cmd --state': { code: 0, stdout: 'running\n' },
};

const FIREWALLD_FILES = { '/proc/net/route': 'Iface\tDestination\tGateway\n' };

function active(unit: string): Record<string, { code: number; stdout: string }> {
  return { [`systemctl is-active ${unit}`]: { code: 0, stdout: 'active\n' } };
}

describe('probeLinux', () => {
  it('picks ufw first when it is enabled, even if firewalld also runs', async () => {
    const probe = await probeLinux(fakeSystem({ files: UFW_FILES, programs: FIREWALLD }));
    expect(probe.backend).toBe('ufw');
  });

  it('picks firewalld when ufw is off and firewall-cmd says it is running', async () => {
    const probe = await probeLinux(
      fakeSystem({
        files: { ...FIREWALLD_FILES, '/etc/ufw/ufw.conf': 'ENABLED=no\n' },
        programs: {
          ...FIREWALLD,
          'firewall-cmd --get-default-zone': { code: 0, stdout: 'public\n' },
          'firewall-cmd --zone=public --list-all': {
            code: 0,
            stdout:
              'public (active)\n  target: default\n  ports: \n  protocols: \n  rich rules: \n',
          },
        },
      }),
    );
    expect(probe.backend).toBe('firewalld');
  });

  it.each([
    ['nftables', 'nftables.service'],
    ['iptables', 'iptables.service'],
  ] as const)(
    'reports the %s service as unreadable and leaves its rules alone',
    async (backend, unit) => {
      const probe = await probeLinux(fakeSystem({ programs: active(unit) }));
      expect(probe).toMatchObject({ backend, filtering: null, draft: null });
      expect(probe.stateOf({ purpose: 'webrtc', protocol: 'tcp', port: 8555 })).toBe('unknown');
      expect(probe.fixable.size).toBe(0);
    },
  );

  it('prefers nftables over iptables when both are active', async () => {
    const probe = await probeLinux(
      fakeSystem({ programs: { ...active('nftables.service'), ...active('iptables.service') } }),
    );
    expect(probe.backend).toBe('nftables');
  });

  it('finds no firewall and treats every opening as open when nothing is active', async () => {
    const probe = await probeLinux(fakeSystem());
    expect(probe).toMatchObject({ backend: 'none', filtering: false, draft: null });
    expect(probe.stateOf({ purpose: 'webrtc', protocol: 'tcp', port: 8555 })).toBe('open');
    expect(probe.watch).toEqual(['/etc/ufw']);
  });

  it('does not count a failed systemctl answer as an active unit', async () => {
    const probe = await probeLinux(
      fakeSystem({
        programs: { 'systemctl is-active nftables.service': { code: 3, stdout: 'inactive\n' } },
      }),
    );
    expect(probe.backend).toBe('none');
  });
});
