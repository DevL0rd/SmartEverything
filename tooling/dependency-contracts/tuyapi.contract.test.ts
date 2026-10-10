import { EventEmitter } from 'node:events';
import TuyaDevice from 'tuyapi';
import { describe, expect, it } from 'vitest';
import { hubDeclaredVersion } from './hub-manifest';
import { installedVersion } from './versions';

describe('tuyapi contract', () => {
  it('is installed at exactly the version the hub declares', () => {
    expect(installedVersion('tuyapi')).toBe(hubDeclaredVersion('tuyapi'));
  });

  it('builds a device for every protocol version the hub reads from broadcasts, without connecting', () => {
    for (const version of ['3.1', '3.3', '3.4', '3.5']) {
      const device = new TuyaDevice({
        id: 'bf0123456789abcdef',
        key: '0123456789abcdef',
        ip: '127.0.0.1',
        version,
        issueGetOnConnect: true,
        issueRefreshOnConnect: false,
      });
      expect(device).toBeInstanceOf(EventEmitter);
      expect(device.isConnected()).toBe(false);
    }
  });

  it('offers the calls the hub drives a device through', () => {
    const device = new TuyaDevice({
      id: 'bf0123456789abcdef',
      key: '0123456789abcdef',
      ip: '127.0.0.1',
    });
    for (const method of ['connect', 'disconnect', 'get', 'set', 'refresh']) {
      expect(typeof Reflect.get(device, method)).toBe('function');
    }
  });
});
