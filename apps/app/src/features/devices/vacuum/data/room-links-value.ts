import { useEffect } from 'react';
import {
  VACUUM_ROOM_LINKS_KEY,
  type JsonValue,
  type VacuumRoomLinksSummary,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { useDeviceValue } from '../../../../store/selectors';
import { linkNoticeOf, parseRoomLinksSummary, type LinkNotice } from '../model/room-links';
import { readingOf } from '../model/readings';

const log = new Logger('app.devices');

export const NO_LINKS = 'none';

export function useRoomLinksValue(deviceId: string): JsonValue | undefined {
  return useDeviceValue(deviceId, VACUUM_ROOM_LINKS_KEY)?.value;
}

export function linksKeyPart(value: JsonValue | undefined): string {
  return typeof value === 'string' && value !== '' ? value : NO_LINKS;
}

export function useRoomLinksSummaryOf(
  deviceId: string,
  value: JsonValue | undefined,
): VacuumRoomLinksSummary | null {
  const reading = readingOf(() => parseRoomLinksSummary(value));
  const problem = reading.ok ? null : reading.problem;
  useEffect(() => {
    if (problem !== null) {
      log.warn('vacuum.room_links_unreadable', { deviceId, problem });
    }
  }, [deviceId, problem]);
  return reading.ok ? reading.value : null;
}

export function useRoomLinksSummary(deviceId: string): VacuumRoomLinksSummary | null {
  return useRoomLinksSummaryOf(deviceId, useRoomLinksValue(deviceId));
}

export function useLinkNotice(deviceId: string): LinkNotice | null {
  return linkNoticeOf(useRoomLinksSummary(deviceId));
}
