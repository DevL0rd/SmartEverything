import { useEffect, useRef } from 'react';
import { Logger } from '@smarteverything/logging';
import { router, useGlobalSearchParams, useSegments } from 'expo-router';
import type { AppHref } from '../components/app-href';
import { parseGroupPageParams } from '../features/device-groups';

const log = new Logger('app.nav');

type ColdLinkParams = Readonly<Record<string, string | string[]>> & {
  readonly deviceId?: string;
  readonly roomId?: string;
  readonly section?: string;
  readonly page?: string;
};

function homeRoomHref(subPages: readonly string[], params: ColdLinkParams): AppHref | null {
  const { roomId } = params;
  if (roomId === undefined || subPages.length > 1) {
    return null;
  }
  const [subPage] = subPages;
  if (subPage === 'lights') {
    const { member, edit, focus } = parseGroupPageParams(params);
    return {
      pathname: '/(app)/(home)/rooms/[roomId]/lights',
      params: { ...params, roomId, member, edit: edit ? '1' : null, focus },
    };
  }
  return subPage === undefined
    ? { pathname: '/(app)/(home)/rooms/[roomId]', params: { ...params, roomId } }
    : null;
}

function homeHref(segments: readonly string[], params: ColdLinkParams): AppHref | null {
  const [, , page, , subPage] = segments;
  if (page === 'weather') {
    return '/(app)/(home)/weather';
  }
  if (page === 'rooms') {
    return homeRoomHref(segments.slice(4), params);
  }
  const { deviceId, page: settingsPage } = params;
  if (page !== 'device' || deviceId === undefined) {
    return null;
  }
  return subPage === 'settings'
    ? homeSettingsHref(deviceId, settingsPage)
    : homeDeviceHref(deviceId, params);
}

function homeSettingsHref(deviceId: string, page: string | undefined): AppHref {
  const id = encodeURIComponent(deviceId);
  return page !== undefined
    ? `/(app)/(home)/device/${id}/settings/${encodeURIComponent(page)}`
    : `/(app)/(home)/device/${id}/settings`;
}

function homeDeviceHref(deviceId: string, params: ColdLinkParams): AppHref {
  const { section } = params;
  return section === undefined
    ? { pathname: '/(app)/(home)/device/[deviceId]', params: { ...params, deviceId } }
    : {
        pathname: '/(app)/(home)/device/[deviceId]/[section]',
        params: { ...params, deviceId, section },
      };
}

export function useNaturalTabForColdLinks(): void {
  const segments: readonly string[] = useSegments();
  const params = useGlobalSearchParams<ColdLinkParams>();
  const checked = useRef(false);
  useEffect(() => {
    const group = segments[1];
    if (checked.current || group === undefined) {
      return;
    }
    checked.current = true;
    const target = group === '(home)' ? null : homeHref(segments, params);
    log.debug('coldlink.checked', { group, page: segments[2] ?? null, redirect: target !== null });
    if (target !== null) {
      router.dismissAll();
      router.replace(target, { withAnchor: true });
    }
  }, [segments, params]);
}
