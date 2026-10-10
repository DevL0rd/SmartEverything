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

  it('isPermissionGranted refuses the camera even alongside the microphone', () => {
    expect(
      isPermissionGranted({ permission: 'media', requestingUrl: APP_PAGE, mediaTypes: ['video'] }),
    ).toBe(false);
    expect(
      isPermissionGranted({
        permission: 'media',
        requestingUrl: APP_PAGE,
        mediaTypes: ['audio', 'video'],
      }),
    ).toBe(false);
  });

  it('isPermissionGranted refuses a media request that names no media type', () => {
    expect(
      isPermissionGranted({ permission: 'media', requestingUrl: APP_PAGE, mediaTypes: [] }),
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

  it('isSafeExternalUrl allows https only', () => {
    expect(isSafeExternalUrl('https://developer.smartthings.com/docs')).toBe(true);
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'smb://share',
      'nope',
    ]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});
