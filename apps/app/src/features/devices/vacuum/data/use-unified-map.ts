import { useMemo } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { useDevices, useRooms } from '../../../../store/selectors';
import { useHomeMap } from '../../../home-map';
import { readingOf, valueOrNull } from '../model/readings';
import { unifiedMapOf, unifiedPlaceOf, type UnifiedMap } from '../model/unified-map';
import { parseMapVersion } from './map-feed';
import { useVacuumScene } from './scene-query';

export function useUnifiedMap(
  deviceId: string,
  versionText: JsonValue | undefined,
): UnifiedMap | null {
  const version = valueOrNull(readingOf(() => parseMapVersion(versionText)));
  const { scene } = useVacuumScene(deviceId, version);
  const { map } = useHomeMap();
  const rooms = useRooms();
  const devices = useDevices();
  return useMemo(() => {
    const place = unifiedPlaceOf(map, deviceId);
    if (place === null) return null;
    return unifiedMapOf(place, scene, {
      homeRoomName: (roomId) => rooms.find((room) => room.id === roomId)?.name ?? null,
      device: (id) => {
        const device = devices.find((item) => item.id === id);
        return device === undefined ? null : { name: device.label, kind: device.kind };
      },
    });
  }, [map, deviceId, scene, rooms, devices]);
}
