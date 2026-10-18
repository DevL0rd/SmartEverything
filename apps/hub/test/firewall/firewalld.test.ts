import type { PortRule } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { firewalldRunning, probeFirewalld } from '../../src/firewall/firewalld';
import type { FirewallSystem } from '../../src/firewall/system';
import { fakeSystem } from './fake-system';

const CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: '192.168.1.50' };
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const PLUGIN: PortRule = {
  purpose: 'plugin',
  protocol: 'udp',
  port: 1900,
  source: '192.168.1.0/24',
};

const ROUTE_TABLE = 'Iface\tDestination\tGateway\nenp3s0\t00000000\t0101A8C0\n';

interface ZoneListing {
  readonly target?: string;
  readonly ports?: string;
  readonly protocols?: string;
  readonly rich?: string[];
}

function listing(zone: ZoneListing): string {
  return [
    'public (active)',
    `  target: ${zone.target ?? 'default'}`,
    '  interfaces: enp3s0',
    `  ports: ${zone.ports ?? ''}`,
    `  protocols: ${zone.protocols ?? ''}`,
    '  rich rules: ',
    ...(zone.rich ?? []).map((rule) => `\t${rule}`),
  ].join('\n');
}

function system(zone: ZoneListing): FirewallSystem {
  return fakeSystem({
    files: { '/proc/net/route': ROUTE_TABLE },
    programs: {
      'firewall-cmd --get-zone-of-interface=enp3s0': { code: 0, stdout: 'public\n' },
      'firewall-cmd --zone=public --list-all': { code: 0, stdout: listing(zone) },
    },
  });
}

describe('firewalldRunning', () => {
  it('is true only when firewall-cmd reports running', async () => {
    expect(
      await firewalldRunning(
        fakeSystem({ programs: { 'firewall-cmd --state': { code: 0, stdout: 'running\n' } } }),
      ),
    ).toBe(true);
    expect(
      await firewalldRunning(
        fakeSystem({ programs: { 'firewall-cmd --state': { code: 252, stdout: 'not running' } } }),
      ),
    ).toBe(false);
    expect(await firewalldRunning(fakeSystem())).toBe(false);
  });
});

describe('probeFirewalld', () => {
  it('uses the zone of the default-route interface and falls back to the default zone', async () => {
    const probe = await probeFirewalld(system({}));
    expect(probe.detail).toContain('public zone');

    const fallback = await probeFirewalld(
      fakeSystem({
        programs: {
          'firewall-cmd --get-default-zone': { code: 0, stdout: 'home\n' },
          'firewall-cmd --zone=home --list-all': { code: 0, stdout: listing({ target: 'ACCEPT' }) },
        },
      }),
    );
    expect(fallback.filtering).toBe(false);
    expect(fallback.detail).toContain('home zone accepts everything');
  });

  it('opens every rule when the zone target is ACCEPT or the protocol is allowed whole', async () => {
    const accept = await probeFirewalld(system({ target: 'ACCEPT' }));
    expect(accept.stateOf(CAMERA)).toBe('open');
    const udp = await probeFirewalld(system({ protocols: 'udp' }));
    expect(udp.stateOf(CAMERA)).toBe('open');
    expect(udp.stateOf(WEBRTC)).toBe('missing');
  });

  it('reads WebRTC and plugin ports from the zone port list, including ranges', async () => {
    const probe = await probeFirewalld(system({ ports: '8555/tcp 1000-2000/udp' }));
    expect(probe.stateOf(WEBRTC)).toBe('open');
    expect(probe.stateOf({ ...WEBRTC, protocol: 'udp' })).toBe('missing');
    expect(probe.stateOf(PLUGIN)).toBe('open');
  });

  it('reads source rich rules for cameras, with deny beating accept and NOT sources ignored', async () => {
    const accept = await probeFirewalld(
      system({ rich: ['rule family="ipv4" source address="192.168.1.0/24" accept'] }),
    );
    expect(accept.stateOf(CAMERA)).toBe('open');
    expect(accept.stateOf({ ...CAMERA, source: '192.168.2.9' })).toBe('missing');

    const denied = await probeFirewalld(
      system({
        rich: [
          'rule family="ipv4" source address="192.168.1.0/24" accept',
          'rule family="ipv4" source address="192.168.1.50" drop',
        ],
      }),
    );
    expect(denied.stateOf(CAMERA)).toBe('denied');

    const negated = await probeFirewalld(
      system({ rich: ['rule family="ipv4" source NOT address="192.168.1.50" accept'] }),
    );
    expect(negated.stateOf(CAMERA)).toBe('missing');

    const portBound = await probeFirewalld(
      system({
        rich: [
          'rule family="ipv4" source address="192.168.1.50" port port="80" protocol="tcp" accept',
        ],
      }),
    );
    expect(portBound.stateOf(CAMERA)).toBe('missing');
  });

  it('reads plugin rich rules by source network, port and protocol', async () => {
    const probe = await probeFirewalld(
      system({
        rich: [
          'rule family="ipv4" source address="192.168.1.0/24" port port="1900" protocol="udp" accept',
        ],
      }),
    );
    expect(probe.stateOf(PLUGIN)).toBe('open');
    expect(probe.stateOf({ ...PLUGIN, port: 1901 })).toBe('missing');
    expect(probe.stateOf({ ...PLUGIN, protocol: 'tcp' })).toBe('missing');
  });

  it('drafts the needed rules for the zone and treats only missing and unknown as fixable', async () => {
    const probe = await probeFirewalld(system({}));
    expect(
      probe.draft?.([{ id: 'a', deviceIds: [], pluginIds: [], rule: CAMERA, state: 'missing' }]),
    ).toEqual({
      backend: 'firewalld',
      zone: 'public',
      rules: [CAMERA],
      unprivilegedPortStart: null,
    });
    expect([...probe.fixable].sort()).toEqual(['missing', 'unknown']);
    expect(probe.filtering).toBe(true);
  });

  it('fails loudly naming the command when firewall-cmd cannot answer', async () => {
    await expect(probeFirewalld(fakeSystem())).rejects.toThrow('firewall-cmd --get-default-zone');
    await expect(
      probeFirewalld(
        fakeSystem({
          programs: {
            'firewall-cmd --get-default-zone': { code: 0, stdout: 'public' },
            'firewall-cmd --zone=public --list-all': { code: 1, stdout: '', stderr: 'boom' },
          },
        }),
      ),
    ).rejects.toThrow('it exited with 1: boom');
  });
});
