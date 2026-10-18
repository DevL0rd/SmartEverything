import type { PortRule } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { probeWindows } from '../../src/firewall/windows';
import type { FirewallSystem } from '../../src/firewall/system';

const CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: '192.168.1.50' };
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const HUB: PortRule = { purpose: 'hub', protocol: 'tcp', port: 8788, source: '192.168.1.0/24' };

interface Rule {
  action?: string;
  profile?: string;
  protocol?: string;
  localPort?: string[] | string;
  remoteAddress?: string[] | string;
}

interface Layout {
  profiles?: { name: string; enabled: string; inbound: string }[];
  active?: string[] | string;
  rules?: Rule[];
  appRules?: Rule[];
}

const PRIVATE_BLOCKING = [{ name: 'Private', enabled: 'True', inbound: 'Block' }];

function rule(overrides: Rule = {}): Rule {
  return {
    action: 'Allow',
    profile: 'Any',
    protocol: 'Any',
    localPort: ['Any'],
    remoteAddress: ['Any'],
    ...overrides,
  };
}

function system(layout: Layout): FirewallSystem {
  const answer = {
    profiles: PRIVATE_BLOCKING,
    active: ['Private'],
    rules: [],
    appRules: [],
    ...layout,
  };
  return {
    platform: 'win32',
    go2rtcBinary: 'C:\\go2rtc.exe',
    appBinary: 'C:\\app.exe',
    run: (file) =>
      Promise.resolve(
        file === 'powershell.exe' ? { code: 0, stdout: JSON.stringify(answer), stderr: '' } : null,
      ),
    read: () => Promise.resolve(null),
    watch: (): null => null,
  };
}

async function stateOf(layout: Layout, wanted: PortRule): Promise<string> {
  return (await probeWindows(system(layout))).stateOf(wanted);
}

describe('probeWindows', () => {
  it('reports filtering on the active profile that blocks inbound by default', async () => {
    const probe = await probeWindows(system({}));
    expect(probe).toMatchObject({ backend: 'windows', filtering: true });
    expect(probe.detail).toContain('active Private network');
  });

  it('is not filtering when the active profile is off, allows inbound, or is not the active one', async () => {
    for (const layout of [
      { profiles: [{ name: 'Private', enabled: 'False', inbound: 'Block' }] },
      { profiles: [{ name: 'Private', enabled: 'True', inbound: 'Allow' }] },
      { profiles: [{ name: 'Public', enabled: 'True', inbound: 'Block' }] },
    ]) {
      const probe = await probeWindows(system(layout));
      expect(probe.filtering).toBe(false);
      expect(probe.stateOf(WEBRTC)).toBe('open');
    }
  });

  it('maps the Windows network category DomainAuthenticated to the Domain profile', async () => {
    const probe = await probeWindows(
      system({
        profiles: [{ name: 'Domain', enabled: 'True', inbound: 'Block' }],
        active: ['DomainAuthenticated'],
      }),
    );
    expect(probe.filtering).toBe(true);
  });

  it('accepts PowerShell collapsing single-item lists to plain values', async () => {
    const probe = await probeWindows(
      system({
        active: 'Private',
        rules: [rule({ protocol: 'TCP', localPort: '8555', remoteAddress: 'Any' })],
      }),
    );
    expect(probe.stateOf(WEBRTC)).toBe('open');
  });

  it('is missing without a rule and open with an allow rule for the program', async () => {
    expect(await stateOf({}, WEBRTC)).toBe('missing');
    expect(await stateOf({ rules: [rule({ protocol: 'TCP', localPort: ['8555'] })] }, WEBRTC)).toBe(
      'open',
    );
  });

  it('matches protocol, port lists and ranges', async () => {
    const tcp = (localPort: string[], protocol = 'TCP'): Layout => ({
      rules: [rule({ protocol, localPort })],
    });
    expect(await stateOf(tcp(['8000-9000']), WEBRTC)).toBe('open');
    expect(await stateOf(tcp(['80,8555']), WEBRTC)).toBe('open');
    expect(await stateOf(tcp(['8556']), WEBRTC)).toBe('missing');
    expect(await stateOf(tcp(['8555'], 'UDP'), WEBRTC)).toBe('missing');
    expect(await stateOf(tcp(['RPC']), WEBRTC)).toBe('missing');
  });

  it('covers a camera source by exact address, subnet with prefix or mask, range, LocalSubnet or Any', async () => {
    for (const remoteAddress of [
      '192.168.1.50',
      '192.168.1.0/24',
      '192.168.1.0/255.255.255.0',
      '192.168.1.10-192.168.1.99',
      'LocalSubnet',
      'Any',
    ]) {
      expect(await stateOf({ rules: [rule({ remoteAddress: [remoteAddress] })] }, CAMERA)).toBe(
        'open',
      );
    }
    for (const remoteAddress of ['192.168.1.51', '10.0.0.0/8', '192.168.1.60-192.168.1.99']) {
      expect(await stateOf({ rules: [rule({ remoteAddress: [remoteAddress] })] }, CAMERA)).toBe(
        'missing',
      );
    }
  });

  it('needs a rule covering both ends of a subnet source', async () => {
    const half = { appRules: [rule({ remoteAddress: ['192.168.1.0-192.168.1.127'] })] };
    expect(await stateOf(half, HUB)).toBe('missing');
    const whole = { appRules: [rule({ remoteAddress: ['192.168.1.0/24'] })] };
    expect(await stateOf(whole, HUB)).toBe('open');
  });

  it('judges camera and live video by the go2rtc rules and the rest by the app rules', async () => {
    const layout = { rules: [rule()], appRules: [] };
    expect(await stateOf(layout, WEBRTC)).toBe('open');
    expect(await stateOf(layout, HUB)).toBe('missing');
  });

  it('is denied when a block rule covers the opening on a filtering profile, and ignores one on another profile', async () => {
    const block = rule({ action: 'Block' });
    expect(await stateOf({ rules: [rule(), block] }, WEBRTC)).toBe('denied');
    expect(await stateOf({ rules: [rule(), { ...block, profile: 'Public' }] }, WEBRTC)).toBe(
      'open',
    );
  });

  it('needs an allow rule for every filtering profile', async () => {
    const layout = {
      profiles: [
        { name: 'Private', enabled: 'True', inbound: 'Block' },
        { name: 'Public', enabled: 'True', inbound: 'Block' },
      ],
      active: ['Private', 'Public'],
    };
    expect(await stateOf({ ...layout, rules: [rule({ profile: 'Private' })] }, WEBRTC)).toBe(
      'missing',
    );
    expect(
      await stateOf({ ...layout, rules: [rule({ profile: 'Private, Public' })] }, WEBRTC),
    ).toBe('open');
  });

  it('drafts a plan for the openings asked for and can fix all but denied ones', async () => {
    const probe = await probeWindows(system({}));
    expect(
      probe.draft?.([{ id: 'x', deviceIds: [], pluginIds: [], rule: WEBRTC, state: 'missing' }]),
    ).toEqual({
      backend: 'windows',
      program: 'C:\\go2rtc.exe',
      appProgram: 'C:\\app.exe',
      rules: [WEBRTC],
    });
    expect([...probe.fixable].sort()).toEqual(['missing', 'unknown']);
  });

  it('refuses output that is not JSON or has the wrong shape', async () => {
    const answering = (stdout: string): FirewallSystem => ({
      ...system({}),
      run: () => Promise.resolve({ code: 0, stdout, stderr: '' }),
    });
    await expect(probeWindows(answering('Access denied'))).rejects.toThrow(
      /answered text that is not JSON/,
    );
    await expect(probeWindows(answering('{"profiles":5}'))).rejects.toThrow(/wrong shape/);
  });

  it('fails when PowerShell is missing', async () => {
    await expect(probeWindows({ ...system({}), run: () => Promise.resolve(null) })).rejects.toThrow(
      'it is not installed',
    );
  });
});
