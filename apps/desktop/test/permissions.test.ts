import { describe, expect, it } from 'vitest';
import { isAppOrigin, originOf } from '../src/origin.js';
import { isPermissionGranted, isSafeExternalUrl } from '../src/permissions.js';

const APP_PAGE = 'app://smarteverything/cameras/front-door';

describe('isPermissionGranted', () => {
  it('isPermissionGranted lets the app use the microphone for two-way talk', () => {
    expect(
      isPermissionGranted({ permission: 'media', requestingUrl: APP_PAGE, mediaTypes: ['audio'] }),
    ).toBe(true);
  });

  it('isPermissionGranted lets the app use the camera alone or with the microphone for video calls', () => {
    expect(
      isPermissionGranted({ permission: 'media', requestingUrl: APP_PAGE, mediaTypes: ['video'] }),
    ).toBe(true);
    expect(
      isPermissionGranted({
        permission: 'media',
        requestingUrl: APP_PAGE,
        mediaTypes: ['audio', 'video'],
      }),
    ).toBe(true);
  });

  it('isPermissionGranted refuses a media request for anything but audio and video', () => {
    expect(
      isPermissionGranted({
        permission: 'media',
        requestingUrl: APP_PAGE,
        mediaTypes: ['audio', 'unknown'],
      }),
    ).toBe(false);
  });

  it('isPermissionGranted lets the app capture the screen and refuses every other origin', () => {
    expect(
      isPermissionGranted({
        permission: 'display-capture',
        requestingUrl: APP_PAGE,
        mediaTypes: [],
      }),
    ).toBe(true);
    expect(
      isPermissionGranted({
        permission: 'display-capture',
        requestingUrl: 'https://evil.example',
        mediaTypes: [],
      }),
    ).toBe(false);
  });

  it('isPermissionGranted answers the typeless media request that getDisplayMedia raises: the app only', () => {
    expect(
      isPermissionGranted({ permission: 'media', requestingUrl: APP_PAGE, mediaTypes: [] }),
    ).toBe(true);
    expect(
      isPermissionGranted({
        permission: 'media',
        requestingUrl: 'https://evil.example',
        mediaTypes: [],
      }),
    ).toBe(false);
  });

  it('isPermissionGranted refuses every origin other than the app', () => {
    for (const requestingUrl of [
      'https://evil.example',
      'app://other/',
      'file:///etc/passwd',
      undefined,
    ]) {
      expect(
        isPermissionGranted({ permission: 'media', requestingUrl, mediaTypes: ['audio'] }),
      ).toBe(false);
      expect(isPermissionGranted({ permission: 'fullscreen', requestingUrl, mediaTypes: [] })).toBe(
        false,
      );
    }
  });

  it('isPermissionGranted allows fullscreen and clipboard writes for the app only', () => {
    expect(
      isPermissionGranted({ permission: 'fullscreen', requestingUrl: APP_PAGE, mediaTypes: [] }),
    ).toBe(true);
    expect(
      isPermissionGranted({
        permission: 'clipboard-sanitized-write',
        requestingUrl: APP_PAGE,
        mediaTypes: [],
      }),
    ).toBe(true);
  });

  it('isPermissionGranted refuses everything else, including location and notifications', () => {
    for (const permission of [
      'geolocation',
      'notifications',
      'openExternal',
      'clipboard-read',
      'usb',
    ]) {
      expect(isPermissionGranted({ permission, requestingUrl: APP_PAGE, mediaTypes: [] })).toBe(
        false,
      );
    }
  });
});

describe('origins and external links', () => {
  it('originOf keeps the scheme and host of a custom standard scheme', () => {
    expect(originOf('app://smarteverything/a/b?c=d')).toBe('app://smarteverything');
    expect(originOf('app://smarteverything')).toBe('app://smarteverything');
  });

  it('originOf answers undefined for text without a host', () => {
    expect(originOf('not a url')).toBeUndefined();
    expect(originOf('about:blank')).toBeUndefined();
  });

  it('isAppOrigin refuses a look-alike host', () => {
    expect(isAppOrigin('app://smarteverything.evil/')).toBe(false);
    expect(isAppOrigin('app://smarteverything/')).toBe(true);
  });

  it('isSafeExternalUrl opens http and https pages, such as the router or AdGuard on the home network', () => {
    for (const url of [
      'https://developer.smartthings.com/docs',
      'http://192.168.1.1/',
      'http://adguard.local:3000/#/dashboard',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(true);
    }
  });

  it('isSafeExternalUrl refuses files, scripts, custom schemes and text that is not a URL', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'smb://share',
      'smarteverything://pair',
      'app://smarteverything/',
      'nope',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});
