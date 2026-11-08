import { describe, expect, it } from 'vitest';
import type { FirewallStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../../src/database/port';
import { FirewallMonitor } from '../../src/firewall/monitor';
import { UFW_FILES, fakeSystem, memoryMacs, type MemoryMacs } from './fake-system';

const CAMERA = '3f1b1c52-6d1a-4f0e-9a52-0d8b5b0a0010';
const ADDRESS = '192.168.1.50';

const CAMERA_DEVICE: DeviceRecord = {
  id: CAMERA,
  provider: 'xiaomi',
  externalId: CAMERA,
  parentId: null,
  kind: 'camera',
  online: true,
  roomId: null,
  capabilities: [],
  details: { go2rtcSource: `rtsp://${ADDRESS}/stream` },
};

const MAC = 'b8:88:80:d7:19:ac';
const ARP_HEADER =
  'IP address       HW type     Flags       HW address            Mask     Device\n';

function monitor(
  macs: MemoryMacs = memoryMacs({ [CAMERA]: MAC }),
  arp = '',
  user = '',
  after = 'COMMIT\n',
): FirewallMonitor {
  return new FirewallMonitor({
    system: fakeSystem({
      files: {
        ...UFW_FILES,
        '/etc/ufw/user.rules': user,
        '/etc/ufw/after.rules': after,
        '/etc/ufw/after6.rules': after,
        '/proc/net/arp': `${ARP_HEADER}${arp}`,
      },
    }),
    macs,
    webrtcPort: 8555,
    now: () => new Date('2026-10-18T12:00:00.000Z'),
    log: new Logger('hub.firewall'),
  });
}

function stateOf(status: FirewallStatus): string | undefined {
  return status.cameras.find((camera) => camera.deviceId === CAMERA)?.state;
}

describe('FirewallMonitor camera health', () => {
  it('shows a camera that went down as blocked and publishes the change once', async () => {
    const firewall = monitor();
    const published: FirewallStatus[] = [];
    firewall.onChange((status) => {
      published.push(status);
    });
    firewall.devicesChanged([CAMERA_DEVICE]);
    const before = await firewall.check();
    expect(stateOf(before)).toBe('needs_rule');
    published.length = 0;
    firewall.cameraFailed(CAMERA);
    firewall.cameraFailed(CAMERA);
    expect(published.map(stateOf)).toStrictEqual(['blocked']);
    expect(published[0]?.cameras[0]?.failedAt).toBe('2026-10-18T12:00:00.000Z');
    expect(firewall.blockingAddress(CAMERA)).toBe(ADDRESS);
  });

  it('shows the camera as it was once it recovers and publishes that once', async () => {
    const firewall = monitor();
    firewall.devicesChanged([CAMERA_DEVICE]);
    await firewall.check();
    firewall.cameraFailed(CAMERA);
    const published: FirewallStatus[] = [];
    firewall.onChange((status) => {
      published.push(status);
    });
    firewall.cameraRecovered(CAMERA);
    firewall.cameraRecovered(CAMERA);
    expect(published.map(stateOf)).toStrictEqual(['needs_rule']);
    expect(published[0]?.cameras[0]?.failedAt).toBeNull();
  });
});

describe('FirewallMonitor MAC addresses', () => {
  const ARP_ENTRY = `${ADDRESS}    0x1         0x2         ${MAC}     *        enp108s0\n`;

  it('keys the camera opening by its MAC address and shows the address it is at now', async () => {
    const firewall = monitor();
    firewall.devicesChanged([CAMERA_DEVICE]);
    const status = await firewall.check();
    expect(status.openings.find((opening) => opening.deviceIds.includes(CAMERA))).toMatchObject({
      id: `camera:mac:${MAC}`,
      rule: { purpose: 'camera', protocol: 'udp', mac: MAC, address: ADDRESS },
      state: 'missing',
    });
    expect(status.cameras[0]).toMatchObject({ mac: MAC, address: ADDRESS });
    expect(status.plan).toMatchObject({
      backend: 'ufw',
      mac: { entries: [{ mac: MAC, protocol: 'udp', port: null }] },
    });
    firewall.stop();
  });

  it('keeps the opening open when the camera moves to another address', async () => {
    const after = `# BEGIN SmartEverything MAC openings\n-A ufw-after-input -p udp -m mac --mac-source ${MAC} -j ACCEPT\n# END SmartEverything MAC openings\nCOMMIT\n`;
    const firewall = monitor(undefined, '', '', after);
    firewall.devicesChanged([CAMERA_DEVICE]);
    expect((await firewall.check()).cameras[0]?.state).toBe('open');
    firewall.devicesChanged([
      { ...CAMERA_DEVICE, details: { go2rtcSource: 'rtsp://192.168.1.77/stream' } },
    ]);
    const moved = await firewall.check();
    expect(moved.cameras[0]).toMatchObject({ mac: MAC, address: '192.168.1.77', state: 'open' });
    expect(moved.plan).toMatchObject({ mac: null });
    firewall.stop();
  });

  it('learns the MAC address from the neighbor table by the configured address and saves it', async () => {
    const macs = memoryMacs();
    const firewall = monitor(macs, ARP_ENTRY);
    firewall.devicesChanged([CAMERA_DEVICE]);
    const status = await firewall.check();
    expect(macs.saved.get(CAMERA)).toBe(MAC);
    expect(status.unlearned).toStrictEqual([]);
    expect(status.cameras[0]?.mac).toBe(MAC);
    firewall.stop();
  });

  it('opens nothing for a camera whose MAC address is not known yet and says so', async () => {
    const macs = memoryMacs();
    const firewall = monitor(macs);
    firewall.devicesChanged([CAMERA_DEVICE]);
    const status = await firewall.check();
    expect(macs.saved.size).toBe(0);
    expect(status.openings.some((opening) => opening.deviceIds.includes(CAMERA))).toBe(false);
    expect(status.plan).toMatchObject({ mac: null });
    expect(status.unlearned).toStrictEqual([
      { deviceId: CAMERA, purpose: 'camera', address: ADDRESS },
    ]);
    expect(status.cameras[0]).toMatchObject({ mac: null, address: ADDRESS, state: 'unknown' });
    firewall.stop();
  });

  it('ignores neighbor entries that never resolved', async () => {
    const macs = memoryMacs();
    const firewall = monitor(
      macs,
      `${ADDRESS}    0x1         0x0         00:00:00:00:00:00     *        enp108s0\n`,
    );
    firewall.devicesChanged([CAMERA_DEVICE]);
    await firewall.check();
    expect(macs.saved.size).toBe(0);
    firewall.stop();
  });
});
