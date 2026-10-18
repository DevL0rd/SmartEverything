import { describe, expect, it } from 'vitest';
import {
  addressIn,
  cameraAddressOf,
  portIn,
  requiredOpenings,
  sourceEdges,
} from '../../src/firewall/openings';
import { defaultInterface } from '../../src/firewall/lan-networks';

describe('portIn', () => {
  it('matches single ports, colon and dash ranges, and comma lists', () => {
    expect(portIn('8555', 8555)).toBe(true);
    expect(portIn('8555', 8556)).toBe(false);
    expect(portIn('1000:2000', 1500)).toBe(true);
    expect(portIn('1000-2000', 2001)).toBe(false);
    expect(portIn('22,8000:8100', 8050)).toBe(true);
    expect(portIn('22,8000:8100', 23)).toBe(false);
  });
});

describe('addressIn', () => {
  it('matches an address against an IPv4 subnet and a single host', () => {
    expect(addressIn('192.168.1.0/24', '192.168.1.40')).toBe(true);
    expect(addressIn('192.168.1.0/24', '192.168.2.40')).toBe(false);
    expect(addressIn('192.168.1.40', '192.168.1.40')).toBe(true);
    expect(addressIn('192.168.1.40', '192.168.1.41')).toBe(false);
  });

  it('never matches across address families or with text that is not an address', () => {
    expect(addressIn('::/0', '192.168.1.40')).toBe(false);
    expect(addressIn('0.0.0.0/0', 'fe80::1')).toBe(false);
    expect(addressIn('192.168.1.0/24', 'not-an-address')).toBe(false);
    expect(addressIn('fe80::/64', 'fe80::1234')).toBe(true);
  });
});

describe('sourceEdges', () => {
  it('returns the first and last address of an IPv4 network', () => {
    expect(sourceEdges('192.168.1.0/24')).toEqual(['192.168.1.0', '192.168.1.255']);
    expect(sourceEdges('10.0.0.0/8')).toEqual(['10.0.0.0', '10.255.255.255']);
    expect(sourceEdges('0.0.0.0/0')).toEqual(['0.0.0.0', '255.255.255.255']);
  });

  it('returns a lone address or an IPv6 network as itself', () => {
    expect(sourceEdges('192.168.1.7')).toEqual(['192.168.1.7']);
    expect(sourceEdges('fe80::/64')).toEqual(['fe80::']);
  });
});

describe('cameraAddressOf', () => {
  it('reads the host of a stream URL only when it is an IP address', () => {
    expect(cameraAddressOf('rtsp://192.168.1.50:554/live')).toBe('192.168.1.50');
    expect(cameraAddressOf('rtsp://[fe80::1]:554/live')).toBe('fe80::1');
    expect(cameraAddressOf('rtsp://camera.local/live')).toBeNull();
    expect(cameraAddressOf('garbage')).toBeNull();
  });
});

describe('requiredOpenings', () => {
  it('groups devices by address, plugins by port, and always adds the WebRTC pair', () => {
    const openings = requiredOpenings({
      cameras: [
        { deviceId: 'cam-1', address: '192.168.1.50' },
        { deviceId: 'cam-2', address: '192.168.1.50' },
      ],
      pushing: [{ deviceId: 'lamp', address: '192.168.1.60' }],
      plugins: [
        { pluginId: 'a', protocol: 'udp', port: 1900 },
        { pluginId: 'b', protocol: 'udp', port: 1900 },
      ],
      networks: ['192.168.1.0/24', '10.0.0.0/8'],
      webrtcPort: 8555,
      connections: [{ purpose: 'hub', protocol: 'tcp', port: 8788, networks: ['192.168.1.0/24'] }],
    });
    const byId = new Map(openings.map((opening) => [opening.id, opening]));
    expect([...byId.keys()]).toEqual([
      'camera:192.168.1.50',
      'device:192.168.1.60',
      'plugin:udp:1900:192.168.1.0/24',
      'plugin:udp:1900:10.0.0.0/8',
      'hub:tcp:8788:192.168.1.0/24',
      'webrtc:tcp:8555',
      'webrtc:udp:8555',
    ]);
    expect(byId.get('camera:192.168.1.50')?.deviceIds).toEqual(['cam-1', 'cam-2']);
    expect(byId.get('plugin:udp:1900:10.0.0.0/8')?.pluginIds).toEqual(['a', 'b']);
    expect(byId.get('hub:tcp:8788:192.168.1.0/24')?.rule).toEqual({
      purpose: 'hub',
      protocol: 'tcp',
      port: 8788,
      source: '192.168.1.0/24',
    });
  });

  it('asks only for the WebRTC pair when nothing else needs a way in', () => {
    const openings = requiredOpenings({
      cameras: [],
      pushing: [],
      plugins: [],
      networks: [],
      webrtcPort: 8555,
    });
    expect(openings.map((opening) => opening.id)).toEqual(['webrtc:tcp:8555', 'webrtc:udp:8555']);
  });
});

describe('defaultInterface', () => {
  it('names the interface that holds the default route', async () => {
    const table = [
      'Iface\tDestination\tGateway\tFlags',
      'docker0\t000011AC\t00000000\t0001',
      'enp3s0\t00000000\t0101A8C0\t0003',
    ].join('\n');
    expect(await defaultInterface(() => Promise.resolve(table))).toBe('enp3s0');
  });

  it('is null when there is no default route or no route table', async () => {
    expect(await defaultInterface(() => Promise.resolve('Iface\tDestination\n'))).toBeNull();
    expect(await defaultInterface(() => Promise.resolve(null))).toBeNull();
  });
});
