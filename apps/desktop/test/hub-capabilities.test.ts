import { describe, expect, it } from 'vitest';
import { NATIVE_HUB_CAPABILITIES } from '@smarteverything/domain';
import {
  hubCapabilities,
  hubCapabilitiesArgument,
  readHubCapabilities,
} from '../src/hub-network/capabilities.js';

describe('hub capabilities', () => {
  it('offers the route authority and media only when the main process runs them', () => {
    expect(NATIVE_HUB_CAPABILITIES.parse(hubCapabilities(true, true))).toMatchObject({
      routeAuthority: true,
      background: true,
      image: true,
      httpMedia: true,
      download: true,
    });
    expect(NATIVE_HUB_CAPABILITIES.parse(hubCapabilities(true, false))).toMatchObject({
      routeAuthority: true,
      image: false,
      httpMedia: false,
      download: false,
    });
    expect(NATIVE_HUB_CAPABILITIES.parse(hubCapabilities(false, false))).toMatchObject({
      routeAuthority: false,
      background: false,
      http: true,
      websocket: true,
      pairingInspection: true,
    });
  });

  it('refuses a capability the contract does not define', () => {
    expect(
      NATIVE_HUB_CAPABILITIES.safeParse({ ...hubCapabilities(false, false), guest: false }).success,
    ).toBe(false);
  });

  it('reaches the preload through the window arguments without any synchronous call', () => {
    const capabilities = hubCapabilities(true, false);
    const argv = ['electron', '--other', hubCapabilitiesArgument(capabilities)];
    expect(readHubCapabilities(argv)).toEqual(capabilities);
  });

  it('refuses a window opened without its capabilities', () => {
    expect(() => readHubCapabilities(['electron'])).toThrow('none found');
  });
});
