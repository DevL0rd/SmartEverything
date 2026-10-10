import { useEffect, useRef } from 'react';
import { router, useGlobalSearchParams, useSegments, type Href } from 'expo-router';

type DevicePage = 'controls' | 'history' | 'activity' | 'remote';

const DEVICE_PAGES: ReadonlySet<string> = new Set<DevicePage>([
  'controls',
  'history',
  'activity',
  'remote',
]);

function isDevicePage(page: string | undefined): page is DevicePage {
  return page !== undefined && DEVICE_PAGES.has(page);
}

type SettingsPage = 'remotes' | 'diagnostics' | 'camera';

const SETTINGS_PAGES: ReadonlySet<string> = new Set<SettingsPage>([
  'remotes',
  'diagnostics',
  'camera',
]);

function isSettingsPage(page: string | undefined): page is SettingsPage {
  return page !== undefined && SETTINGS_PAGES.has(page);
}

function homeHref(segments: readonly string[], id: string): Href | null {
  const [, , page, , subPage, settingsPage] = segments;
  if (page === 'rooms') {
    return `/(app)/(home)/rooms/${encodeURIComponent(id)}`;
  }
  if (page !== 'device') {
    return null;
  }
  return subPage === 'settings' ? homeSettingsHref(id, settingsPage) : homeDeviceHref(id, subPage);
}

function homeSettingsHref(deviceId: string, page: string | undefined): Href {
  const id = encodeURIComponent(deviceId);
  return isSettingsPage(page)
    ? `/(app)/(home)/device/${id}/settings/${encodeURIComponent(page)}`
    : `/(app)/(home)/device/${id}/settings`;
}

function homeDeviceHref(deviceId: string, page: string | undefined): Href {
  const id = encodeURIComponent(deviceId);
  return isDevicePage(page) ? `/(app)/(home)/device/${id}/${page}` : `/(app)/(home)/device/${id}`;
}

export function useNaturalTabForColdLinks(): void {
  const segments = useSegments();
  const { deviceId, roomId } = useGlobalSearchParams<{ deviceId?: string; roomId?: string }>();
  const checked = useRef(false);
  useEffect(() => {
    const group = segments[1];
    if (checked.current || group === undefined) {
      return;
    }
    checked.current = true;
    const id = deviceId ?? roomId;
    const target = group === '(home)' || id === undefined ? null : homeHref(segments, id);
    if (target !== null) {
      router.dismissAll();
      router.replace(target, { withAnchor: true });
    }
  }, [segments, deviceId, roomId]);
}
