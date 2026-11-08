import type { FirewallOpening, PortRule } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { probeUfw, ufwEnabled } from '../../src/firewall/ufw';
import type { FirewallSystem } from '../../src/firewall/system';
import { fakeSystem } from './fake-system';

const CONF = '/etc/ufw/ufw.conf';
const DEFAULTS = '/etc/default/ufw';
const V4 = '/etc/ufw/user.rules';
const V6 = '/etc/ufw/user6.rules';

const CAMERA: PortRule = {
  purpose: 'camera',
  protocol: 'udp',
  mac: 'b8:88:80:d7:19:ac',
  address: '192.168.1.50',
};
const DEVICE: PortRule = {
  purpose: 'device',
  protocol: 'udp',
  mac: 'b8:88:80:d7:28:57',
  address: '192.168.1.51',
};
const AFTER = '/etc/ufw/after.rules';
const AFTER6 = '/etc/ufw/after6.rules';
const MAC_BLOCK = (chain: string, ...lines: string[]): string =>
  [
    '*filter',
    '# BEGIN SmartEverything MAC openings',
    ...lines.map((line) =>
      line.includes(' ')
        ? `-A ${chain} ${line}`
        : `-A ${chain} -p udp -m mac --mac-source ${line} -j ACCEPT`,
    ),
    '# END SmartEverything MAC openings',
    'COMMIT',
  ].join('\n');
const LEGACY_CAMERA = '536d61727445766572797468696e672063616d657261';
const LEGACY_DEVICE = '536d61727445766572797468696e67206465766963652070757368';
const WEBRTC: PortRule = { purpose: 'webrtc', protocol: 'tcp', port: 8555 };
const PLUGIN: PortRule = {
  purpose: 'announcement',
  protocol: 'udp',
  port: 1900,
  source: '192.168.1.0/24',
};
const V6_PLUGIN: PortRule = {
  purpose: 'announcement',
  protocol: 'udp',
  port: 1900,
  source: 'fe80::/64',
};

function tuple(...words: string[]): string {
  return `### tuple ### ${words.join(' ')}`;
}

function system(
  v4: string,
  v6 = '',
  policy = 'DROP',
  after: readonly [string, string] = ['COMMIT', 'COMMIT'],
): FirewallSystem {
  return fakeSystem({
    files: {
      [DEFAULTS]: `# comment\nDEFAULT_INPUT_POLICY="${policy}"\n`,
      [V4]: v4,
      [V6]: v6,
      [AFTER]: after[0],
      [AFTER6]: after[1],
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
    expect(probe.stateOf(CAMERA)).toBe('missing');
    expect(probe.stateOf(WEBRTC)).toBe('open');
    expect(probe.stateOf(PLUGIN)).toBe('open');
    expect(probe.stateOf({ ...WEBRTC, protocol: 'udp' })).toBe('missing');
    expect(probe.stateOf({ ...PLUGIN, source: '192.168.2.0/24' })).toBe('missing');
  });

  it('lets the first matching tuple decide, so an earlier deny makes the opening denied', async () => {
    const probe = await probeUfw(
      system(
        [
          tuple('deny', 'udp', '1900', '0.0.0.0/0', 'any', '192.168.1.0/24', 'in'),
          tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in'),
        ].join('\n'),
      ),
    );
    expect(probe.stateOf(PLUGIN)).toBe('denied');
    expect(probe.stateOf({ ...PLUGIN, port: 1901 })).toBe('open');
  });

  it('treats limit as allow, ignores out-direction, route and commented rules, and reads app tuples', async () => {
    const probe = await probeUfw(
      system(
        [
          tuple('allow', 'udp', '1900', '0.0.0.0/0', 'any', '192.168.1.0/24', 'out'),
          tuple('route:allow', 'udp', 'any', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in'),
          tuple('limit', 'tcp', '8555', '0.0.0.0/0', 'any', '0.0.0.0/0', 'in', 'comment=abc'),
        ].join('\n'),
      ),
    );
    expect(probe.stateOf(PLUGIN)).toBe('missing');
    expect(probe.stateOf(WEBRTC)).toBe('open');

    const app = await probeUfw(
      system(tuple('allow', 'tcp', '8555', '0.0.0.0/0', 'any', '0.0.0.0/0', 'Plex', '-', 'in')),
    );
    expect(app.stateOf(WEBRTC)).toBe('open');
  });

  it('reads IPv6 sources from the IPv6 rules file', async () => {
    const probe = await probeUfw(
      system('', tuple('allow', 'udp', '1900', '::/0', 'any', 'fe80::/64', 'in')),
    );
    expect(probe.stateOf(V6_PLUGIN)).toBe('open');
    expect(probe.stateOf(PLUGIN)).toBe('missing');
  });

  it('drafts one rule per needed opening and prepends only where a deny stands in the way', async () => {
    const probe = await probeUfw(system(''));
    const needed: FirewallOpening[] = [
      { id: 'a', deviceIds: [], pluginIds: [], rule: PLUGIN, state: 'missing' },
      { id: 'b', deviceIds: [], pluginIds: [], rule: WEBRTC, state: 'denied' },
    ];
    expect(probe.draft?.({ needed, openings: needed, unlearned: [] })).toEqual({
      backend: 'ufw',
      rules: [
        { rule: PLUGIN, prepend: false },
        { rule: WEBRTC, prepend: true },
      ],
      mac: null,
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

describe('probeUfw MAC openings', () => {
  const opening = (rule: PortRule, state: 'open' | 'missing'): FirewallOpening => ({
    id: rule.purpose,
    deviceIds: [],
    pluginIds: [],
    rule,
    state,
  });
  const both = [opening(CAMERA, 'missing'), opening(DEVICE, 'missing')];

  it('opens a camera or device only when its MAC address is in the managed after.rules block', async () => {
    const probe = await probeUfw(
      system('', '', 'DROP', [MAC_BLOCK('ufw-after-input', CAMERA.mac), 'COMMIT']),
    );
    expect(probe.stateOf(CAMERA)).toBe('open');
    expect(probe.stateOf(DEVICE)).toBe('missing');
    expect(probe.stateOf({ ...CAMERA, address: '192.168.1.99' })).toBe('open');
  });

  it('is not moved by an address rule: only the MAC counts', async () => {
    const probe = await probeUfw(
      system(tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '192.168.1.50', 'in')),
    );
    expect(probe.stateOf(CAMERA)).toBe('missing');
  });

  it('plans the full MAC set and removes the old address rules of devices that now have a MAC', async () => {
    const legacy = [
      tuple(
        'allow',
        'udp',
        'any',
        '0.0.0.0/0',
        'any',
        '192.168.50.147',
        'in',
        `comment=${LEGACY_CAMERA}`,
      ),
      tuple(
        'allow',
        'udp',
        'any',
        '0.0.0.0/0',
        'any',
        '192.168.50.24',
        'in',
        `comment=${LEGACY_DEVICE}`,
      ),
      tuple('allow', 'udp', 'any', '0.0.0.0/0', 'any', '192.168.50.9', 'in', 'comment=616263'),
      tuple(
        'allow',
        'tcp',
        '22',
        '0.0.0.0/0',
        'any',
        '192.168.50.8',
        'in',
        `comment=${LEGACY_CAMERA}`,
      ),
    ].join('\n');
    const probe = await probeUfw(system(legacy));
    const waiting = [{ deviceId: 'd', purpose: 'device' as const, address: '192.168.50.24' }];
    expect(probe.draft?.({ needed: both, openings: both, unlearned: waiting })).toEqual({
      backend: 'ufw',
      rules: [],
      mac: {
        entries: [
          { mac: CAMERA.mac, protocol: 'udp', port: null },
          { mac: DEVICE.mac, protocol: 'udp', port: null },
        ],
        staleAddresses: ['192.168.50.147'],
        staleRules: [],
      },
      unprivilegedPortStart: null,
    });
  });

  it('plans nothing once the block lists exactly the wanted MAC addresses in both files', async () => {
    const synced = await probeUfw(
      system('', '', 'DROP', [
        MAC_BLOCK('ufw-after-input', DEVICE.mac, CAMERA.mac),
        MAC_BLOCK('ufw6-after-input', CAMERA.mac, DEVICE.mac),
      ]),
    );
    const open = [opening(CAMERA, 'open'), opening(DEVICE, 'open')];
    expect(synced.draft?.({ needed: [], openings: open, unlearned: [] })).toBeNull();
    const half = await probeUfw(
      system('', '', 'DROP', [MAC_BLOCK('ufw-after-input', CAMERA.mac, DEVICE.mac), 'COMMIT']),
    );
    expect(half.draft?.({ needed: [], openings: open, unlearned: [] })).toMatchObject({
      mac: {
        entries: [
          { mac: CAMERA.mac, protocol: 'udp', port: null },
          { mac: DEVICE.mac, protocol: 'udp', port: null },
        ],
      },
    });
  });

  it('plans an empty block when a removed device leaves a MAC address behind', async () => {
    const probe = await probeUfw(
      system('', '', 'DROP', [MAC_BLOCK('ufw-after-input', CAMERA.mac), 'COMMIT']),
    );
    expect(probe.draft?.({ needed: [], openings: [], unlearned: [] })).toMatchObject({
      mac: { entries: [], staleAddresses: [], staleRules: [] },
    });
  });

  it('removes a bound copy of a rule that a plain rule for the same network, port and protocol already covers', async () => {
    const hub = '536d61727445766572797468696e6720656e63727970746564204c414e';
    const probe = await probeUfw(
      system(
        [
          tuple(
            'allow',
            'tcp',
            '7882',
            '192.168.1.2',
            'any',
            '192.168.1.0/24',
            'in_eth0',
            `comment=${hub}`,
          ),
          tuple(
            'allow',
            'tcp',
            '7882',
            '0.0.0.0/0',
            'any',
            '192.168.1.0/24',
            'in',
            `comment=${hub}`,
          ),
        ].join('\n'),
      ),
    );
    expect(probe.draft?.({ needed: [], openings: [], unlearned: [] })).toMatchObject({
      mac: {
        staleRules: [
          {
            protocol: 'tcp',
            port: 7882,
            source: '192.168.1.0/24',
            destination: '192.168.1.2',
            interface: 'eth0',
          },
        ],
      },
    });
  });

  it('keeps a bound rule that no plain rule covers', async () => {
    const hub = '536d61727445766572797468696e6720656e63727970746564204c414e';
    const probe = await probeUfw(
      system(
        tuple(
          'allow',
          'tcp',
          '7882',
          '192.168.1.2',
          'any',
          '192.168.1.0/24',
          'in_eth0',
          `comment=${hub}`,
        ),
      ),
    );
    expect(probe.draft?.({ needed: [], openings: [], unlearned: [] })).toBeNull();
  });

  it('leaves the MAC block alone when ufw accepts incoming traffic anyway', async () => {
    const probe = await probeUfw(system('', '', 'ACCEPT'));
    expect(probe.draft?.({ needed: [], openings: both, unlearned: [] })).toBeNull();
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
