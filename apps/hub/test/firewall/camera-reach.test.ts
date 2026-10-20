import { describe, expect, it } from 'vitest';
import type { FirewallStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DeviceRecord } from '../../src/database/port';
import { FirewallMonitor } from '../../src/firewall/monitor';
import { fakeSystem } from './fake-system';

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
