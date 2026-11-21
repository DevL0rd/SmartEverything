import { useMemo } from 'react';
import type { JsonValue } from '@smarteverything/domain';
import { useAllHomeMapSceneLive, useHomeMap } from '../../../home-map';
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
  const live = useAllHomeMapSceneLive();
  return useMemo(() => {
    const place = unifiedPlaceOf(map, deviceId);
    if (place === null) return null;
    return unifiedMapOf(place, scene, live);
  }, [map, deviceId, scene, live]);
}
