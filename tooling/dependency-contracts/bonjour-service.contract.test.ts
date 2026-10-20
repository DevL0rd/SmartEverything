import { describe, expect, it } from 'vitest';
import Bonjour from 'bonjour-service';
import { HUB_MANIFEST, declaredVersion } from './contract-helpers';
import { installedVersion } from './versions';

describe('bonjour-service contract', () => {
  it('is declared by the hub at the installed version', () => {
    expect(declaredVersion(HUB_MANIFEST, 'bonjour-service')).toBe(installedVersion('bonjour-service'));
  });

  it('builds browsers for a service type that report found and lost services', () => {
    const instance = new Bonjour({ type: 'udp4', port: 0 }, () => undefined);
    const browser = instance.find({ type: 'ipp' });
    expect(typeof browser.on).toBe('function');
    expect(typeof browser.update).toBe('function');
    expect(typeof browser.stop).toBe('function');
    expect(Array.isArray(browser.services)).toBe(true);
    browser.stop();
    instance.destroy();
  });
});
