import { describe, expect, it, vi } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { FirewallMonitor } from '../../src/firewall/monitor';
import { requiredOpenings } from '../../src/firewall/openings';
import type { DeviceRecord } from '../../src/database/port';
import { fakeSystem } from './fake-system';

vi.mock('../../src/network/lan', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  lanInterfaces: (): readonly object[] => [
    { name: 'eth0', address: '192.168.1.10', cidr: '192.168.1.10/24', prefix: 24 },
  ],
}));

const TUYA_PLUG = '3f1b1c52-6d1a-4f0e-9a52-0d8b5b0a0001';
const TUYA_LAMP = '3f1b1c52-6d1a-4f0e-9a52-0d8b5b0a0002';
const XIAOMI_FAN = '3f1b1c52-6d1a-4f0e-9a52-0d8b5b0a0003';
const TV = '3f1b1c52-6d1a-4f0e-9a52-0d8b5b0a0004';

function device(id: string, provider: DeviceRecord['provider']): DeviceRecord {
  return {
    id,
    provider,
    externalId: id,
    parentId: null,
    kind: 'switch',
    online: true,
    roomId: null,
    capabilities: [],
    details: {},
  };
}

function monitor(): FirewallMonitor {
  return new FirewallMonitor({
    system: fakeSystem({
      files: {
        '/etc/ufw/ufw.conf': 'ENABLED=yes\n',
        '/etc/default/ufw': 'DEFAULT_INPUT_POLICY="DROP"\n',
        '/etc/ufw/user.rules': '',
        '/etc/ufw/user6.rules': '',
      },
    }),
    webrtcPort: 8555,
    now: () => new Date('2026-10-18T00:00:00Z'),
    log: new Logger('hub.firewall'),
  });
}

describe('requiredOpenings for device announcements', () => {
  it('asks once per port and network for every device that announces itself there', () => {
    const openings = requiredOpenings({
      cameras: [],
      pushing: [],
      plugins: [],
      announcements: [
        { deviceId: 'plug', protocol: 'udp', port: 6666 },
        { deviceId: 'lamp', protocol: 'udp', port: 6666 },
        { deviceId: 'lamp', protocol: 'udp', port: 6667 },
      ],
      networks: ['192.168.1.0/24'],
      webrtcPort: 8555,
    });
    const announced = openings.filter((opening) => opening.rule.purpose === 'announcement');
    expect(announced.map((opening) => opening.id)).toEqual([
      'announcement:udp:6666:192.168.1.0/24',
      'announcement:udp:6667:192.168.1.0/24',
    ]);
    expect(announced[0]?.deviceIds).toEqual(['plug', 'lamp']);
    expect(announced[0]?.rule).toEqual({
      purpose: 'announcement',
      protocol: 'udp',
      port: 6666,
      source: '192.168.1.0/24',
    });
  });
});

describe('FirewallMonitor announcements', () => {
  it('needs the Tuya broadcast ports once a Tuya device exists, blocked by default', async () => {
    const firewall = monitor();
    firewall.devicesChanged([device(TUYA_PLUG, 'tuya'), device(TUYA_LAMP, 'tuya')]);
    const status = await firewall.check();
    const announced = status.openings.filter((opening) => opening.rule.purpose === 'announcement');
    expect(announced.map((opening) => [opening.rule.purpose, opening.state])).toEqual([
      ['announcement', 'missing'],
      ['announcement', 'missing'],
    ]);
    expect(announced.map((opening) => opening.id)).toEqual([
      'announcement:udp:6666:192.168.1.0/24',
      'announcement:udp:6667:192.168.1.0/24',
    ]);
    expect(announced[0]?.deviceIds).toEqual([TUYA_PLUG, TUYA_LAMP]);
    firewall.stop();
  });

  it('needs the SSDP port for a Samsung TV and nothing for providers that hold no listener', async () => {
    const firewall = monitor();
    firewall.devicesChanged([device(TV, 'samsung_tv'), device(XIAOMI_FAN, 'xiaomi')]);
    const status = await firewall.check();
    const announced = status.openings.filter((opening) => opening.rule.purpose === 'announcement');
    expect(announced.map((opening) => opening.id)).toEqual([
      'announcement:udp:1900:192.168.1.0/24',
    ]);
    expect(announced[0]?.deviceIds).toEqual([TV]);
    firewall.stop();
  });

  it('drops the need when the last announcing device is gone', async () => {
    const firewall = monitor();
    firewall.devicesChanged([device(TUYA_PLUG, 'tuya')]);
    await firewall.check();
    firewall.devicesChanged([device(XIAOMI_FAN, 'xiaomi')]);
    const status = await firewall.check();
    expect(status.openings.some((opening) => opening.rule.purpose === 'announcement')).toBe(false);
    firewall.stop();
  });
});
