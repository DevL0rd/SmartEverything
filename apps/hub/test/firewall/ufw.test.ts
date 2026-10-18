import type { PortRule } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { probeUfw, ufwEnabled } from '../../src/firewall/ufw';
import type { FirewallSystem } from '../../src/firewall/system';
import { fakeSystem } from './fake-system';

const CONF = '/etc/ufw/ufw.conf';
const DEFAULTS = '/etc/default/ufw';
const V4 = '/etc/ufw/user.rules';
const V6 = '/etc/ufw/user6.rules';

const CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: '192.168.1.50' };
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const PLUGIN: PortRule = {
  purpose: 'plugin',
  protocol: 'udp',
  port: 1900,
  source: '192.168.1.0/24',
};
const V6_CAMERA: PortRule = { purpose: 'camera', protocol: 'udp', source: 'fe80::1' };

function tuple(...words: string[]): string {
  return `### tuple ### ${words.join(' ')}`;
}

function system(v4: string, v6 = '', policy = 'DROP'): FirewallSystem {
  return fakeSystem({
    files: {
      [DEFAULTS]: `# comment\nDEFAULT_INPUT_POLICY="${policy}"\n`,
      [V4]: v4,
      [V6]: v6,
    },
  });
}

describe('ufwEnabled', () => {
  it('is true only when ufw.conf says ENABLED=yes', async () => {
    expect(await ufwEnabled(fakeSystem({ files: { [CONF]: 'ENABLED=yes\n' } }))).toBe(true);
    expect(await ufwEnabled(fakeSystem({ files: { [CONF]: 'ENABLED=no\n' } }))).toBe(false);
    expect(await ufwEnabled(fakeSystem())).toBe(false);
  });
});

describe('probeUfw', () => {
  it('reports every opening missing when it drops by default and holds no rules', async () => {
    const probe = await probeUfw(system(''));
    expect(probe.filtering).toBe(true);
    expect(probe.stateOf(CAMERA)).toBe('missing');
    expect(probe.stateOf(WEBRTC)).toBe('missing');
  });

  it('reports everything open when ufw accepts incoming traffic by default', async () => {
    const probe = await probeUfw(system('', '', 'ACCEPT'));
    expect(probe.filtering).toBe(false);
    expect(probe.stateOf(CAMERA)).toBe('open');
  });

  it('opens a rule that an allow tuple covers by protocol, port and source', async () => {
    const probe = await probeUfw(
      system(
        [
          tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '192.168.1.0/24', 'in'),
          tuple('allow', 'tcp', '8555', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in'),
          tuple('allow', 'udp', '1900', '0.0.0.0/0', 'any', '192.168.1.0/24', 'in'),
        ].join('\n'),
      ),
    );
    expect(probe.stateOf(CAMERA)).toBe('open');
    expect(probe.stateOf(WEBRTC)).toBe('open');
    expect(probe.stateOf(PLUGIN)).toBe('open');
    expect(probe.stateOf({ ...WEBRTC, protocol: 'udp' })).toBe('missing');
    expect(probe.stateOf({ ...CAMERA, source: '192.168.2.50' })).toBe('missing');
  });

  it('lets the first matching tuple decide, so an earlier deny makes the opening denied', async () => {
    const probe = await probeUfw(
      system(
        [
          tuple('deny', 'udp', 'any', '0.0.0.0/0', 'any', '192.168.1.50', 'in'),
          tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in'),
        ].join('\n'),
      ),
    );
    expect(probe.stateOf(CAMERA)).toBe('denied');
    expect(probe.stateOf({ ...CAMERA, source: '192.168.1.51' })).toBe('open');
  });

  it('treats limit as allow, ignores out-direction, route and commented rules, and reads app tuples', async () => {
    const probe = await probeUfw(
      system(
        [
          tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '192.168.1.50', 'out'),
          tuple('route:allow', 'udp', 'any', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in'),
          tuple('limit', 'tcp', '8555', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in', 'comment=abc'),
        ].join('\n'),
      ),
    );
    expect(probe.stateOf(CAMERA)).toBe('missing');
    expect(probe.stateOf(WEBRTC)).toBe('open');

    const app = await probeUfw(
      system(tuple('allow', 'tcp', '8555', '0.0.0.0/0', 'any', '0.0.0.0/0', 'Plex', '-', 'in')),
    );
    expect(app.stateOf(WEBRTC)).toBe('open');
  });

  it('reads IPv6 sources from the IPv6 rules file', async () => {
    const probe = await probeUfw(
      system('', tuple('allow', 'udp', 'any', '::/0', 'any', 'fe80::1', 'in')),
    );
    expect(probe.stateOf(V6_CAMERA)).toBe('open');
    expect(probe.stateOf(CAMERA)).toBe('missing');
  });

  it('drafts one rule per needed opening and prepends only where a deny stands in the way', async () => {
    const probe = await probeUfw(system(''));
    const draft = probe.draft?.([
      { id: 'a', deviceIds: [], pluginIds: [], rule: CAMERA, state: 'missing' },
      { id: 'b', deviceIds: [], pluginIds: [], rule: WEBRTC, state: 'denied' },
    ]);
    expect(draft).toEqual({
      backend: 'ufw',
      rules: [
        { rule: CAMERA, prepend: false },
        { rule: WEBRTC, prepend: true },
      ],
      unprivilegedPortStart: null,
    });
    expect([...probe.fixable].sort()).toEqual(['denied', 'missing', 'unknown']);
    expect(probe.watch).toEqual(['/etc/ufw']);
  });

  it('fails loudly naming the file when the rules, defaults or policy are missing or malformed', async () => {
    await expect(probeUfw(fakeSystem())).rejects.toThrow('/etc/default/ufw');
    await expect(probeUfw(fakeSystem({ files: { [DEFAULTS]: 'IPV6=yes\n' } }))).rejects.toThrow(
      'DEFAULT_INPUT_POLICY',
    );
    await expect(
      probeUfw(fakeSystem({ files: { [DEFAULTS]: 'DEFAULT_INPUT_POLICY="DROP"\n' } })),
    ).rejects.toThrow('/etc/ufw/user.rules');
    await expect(probeUfw(system(tuple('allow', 'udp')))).rejects.toThrow(
      'A ufw rule tuple must hold',
    );
  });
});

describe('probeUfw when only root can read the rules', () => {
  const rootOnly = fakeSystem({
    files: { [DEFAULTS]: 'DEFAULT_INPUT_POLICY="DROP"\n' },
    unreadable: [V4, V6],
  });

  it('answers unknown for every opening and offers no fix instead of failing the check', async () => {
    const probe = await probeUfw(rootOnly);
    expect(probe).toMatchObject({ backend: 'ufw', filtering: null, draft: null });
    expect(probe.stateOf(CAMERA)).toBe('unknown');
    expect(probe.stateOf(WEBRTC)).toBe('unknown');
    expect(probe.fixable.size).toBe(0);
    expect(probe.detail).toMatch(/only root can read/);
  });

  it('still fails loudly for a read error that is not a permission refusal', async () => {
    const broken: FirewallSystem = {
      ...rootOnly,
      read: () => Promise.reject(new Error('disk gone')),
    };
    await expect(probeUfw(broken)).rejects.toThrow('disk gone');
  });
});
