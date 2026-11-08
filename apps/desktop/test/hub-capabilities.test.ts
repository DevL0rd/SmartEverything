import { describe, expect, it } from 'vitest';
import { NATIVE_HUB_CAPABILITIES } from '@smarteverything/domain';
import {
  hubCapabilities,
  hubCapabilitiesArgument,
  readHubCapabilities,
} from '../src/hub-network/capabilities.js';

describe('hub capabilities', () => {
  it('always runs the route authority and offers media only when its listener started', () => {
    expect(NATIVE_HUB_CAPABILITIES.parse(hubCapabilities(true))).toMatchObject({
      routeAuthority: true,
      background: true,
      image: true,
      httpMedia: true,
      download: true,
    });
    expect(NATIVE_HUB_CAPABILITIES.parse(hubCapabilities(false))).toMatchObject({
      routeAuthority: true,
      background: true,
      http: true,
      websocket: true,
      image: false,
      httpMedia: false,
      download: false,
      pairingInspection: true,
    });
  });

  it('refuses a capability the contract does not define', () => {
    expect(
      NATIVE_HUB_CAPABILITIES.safeParse({ ...hubCapabilities(false), guest: false }).success,
    ).toBe(false);
  });

  it('reaches the preload through the window arguments without any synchronous call', () => {
    const capabilities = hubCapabilities(false);
    const argv = ['electron', '--other', hubCapabilitiesArgument(capabilities)];
    expect(readHubCapabilities(argv)).toEqual(capabilities);
  });

  it('refuses a window opened without its capabilities', () => {
    expect(() => readHubCapabilities(['electron'])).toThrow('none found');
  });
});
