import { useEffect, useRef } from 'react';
import { Logger } from '@smarteverything/logging';
import { router, useGlobalSearchParams, useSegments, type Href } from 'expo-router';

const log = new Logger('app.nav');

function homeHref(
  segments: readonly string[],
  id: string | undefined,
  section: string | undefined,
  settingsPage: string | undefined,
): Href | null {
  const [, , page, , subPage] = segments;
  if (page === 'weather') {
    return '/(app)/(home)/weather';
  }
  if (id === undefined) {
    return null;
  }
  if (page === 'rooms') {
    return `/(app)/(home)/rooms/${encodeURIComponent(id)}`;
  }
  if (page !== 'device') {
    return null;
  }
  return subPage === 'settings' ? homeSettingsHref(id, settingsPage) : homeDeviceHref(id, section);
}

function homeSettingsHref(deviceId: string, page: string | undefined): Href {
  const id = encodeURIComponent(deviceId);
  return page !== undefined
    ? `/(app)/(home)/device/${id}/settings/${encodeURIComponent(page)}`
    : `/(app)/(home)/device/${id}/settings`;
}

function homeDeviceHref(deviceId: string, section: string | undefined): Href {
  const id = encodeURIComponent(deviceId);
  return section === undefined
    ? `/(app)/(home)/device/${id}`
    : `/(app)/(home)/device/${id}/${encodeURIComponent(section)}`;
}

export function useNaturalTabForColdLinks(): void {
  const segments = useSegments();
  const { deviceId, roomId, section, page } = useGlobalSearchParams<{
    deviceId?: string;
    roomId?: string;
    section?: string;
    page?: string;
  }>();
  const checked = useRef(false);
  useEffect(() => {
    const group = segments[1];
    if (checked.current || group === undefined) {
      return;
    }
    checked.current = true;
    const target =
      group === '(home)' ? null : homeHref(segments, deviceId ?? roomId, section, page);
    log.debug('coldlink.checked', { group, page: segments[2] ?? null, redirect: target !== null });
    if (target !== null) {
      router.dismissAll();
      router.replace(target, { withAnchor: true });
    }
  }, [segments, deviceId, roomId, section, page]);
}
