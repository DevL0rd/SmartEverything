import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveItem, DrivePlacement } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { Arc } from '../../../components/charts';
import { Text } from '../../../components/text';
import type { StatusTone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { useDriveItems, useDrivePlacementRows, useDriveRoots } from '../data';
import {
  RING_SIZE,
  RING_THICKNESS,
  coversItem,
  placementRingOf,
  type ComputerRing,
} from './details-model';

const RING_COLOUR: Readonly<Record<StatusTone | 'offline', ColourRole>> = {
  positive: 'positive',
  info: 'info',
  warning: 'warning',
  critical: 'critical',
  offline: 'track',
};

const log = new Logger('app.drive');

function computerNamesIn(
  state: StoreState,
  deviceIds: readonly string[],
): readonly (string | null)[] {
  return deviceIds.map((deviceId) => state.tables.devices.byId[deviceId]?.label ?? null);
}

function useComputerRings(rootId: string, item: DriveItem): readonly ComputerRing[] {
  const root = useDriveRoots().find((one) => one.id === rootId) ?? null;
  const placements = useDrivePlacementRows().filter((placement) => placement.rootId === rootId);
  const folderIds = placements.flatMap((placement) =>
    placement.folderItemId === null ? [] : [placement.folderItemId],
  );
  const folders = useDriveItems(folderIds, rootId);
  const deviceIds = placements.map((placement) => placement.deviceId);
  const names = useStoreSelector((state) => computerNamesIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  const folderOf = (placement: DrivePlacement): DriveItem | null | undefined => {
    if (placement.folderItemId === null) return null;
    return folders[folderIds.indexOf(placement.folderItemId)];
  };
  return placements.flatMap((placement, index) => {
    const folder = folderOf(placement);
    if (folder === undefined || !coversItem(folder?.relPath ?? null, item.relPath)) return [];
    const placedBytes = folder === null ? root?.bytes : folder.bytes;
    if (placedBytes === undefined) return [];
    const name = names[index] ?? null;
    if (name === null) {
      log.warn('placement.device_unknown', {
        placementId: placement.id,
        deviceId: placement.deviceId,
      });
      return [];
    }
    return [placementRingOf(placement, name, placedBytes)];
  });
}

function RingRow({ ring }: { readonly ring: ComputerRing }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${ring.name}, ${ring.place}, ${ring.word}`}
      className="flex-row items-center gap-2"
    >
      <View aria-hidden className="shrink-0">
        <Arc
          value={ring.share}
          size={RING_SIZE}
          thickness={RING_THICKNESS}
          colour={RING_COLOUR[ring.tone ?? 'offline']}
        />
      </View>
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {ring.name}
        <Text variant="callout" tone="variant">
          {` · ${ring.place}`}
        </Text>
      </Text>
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {ring.word}
      </Text>
    </View>
  );
}

export function OnComputers({
  rootId,
  item,
}: {
  readonly rootId: string;
  readonly item: DriveItem;
}): ReactNode {
  const rings = useComputerRings(rootId, item);
  if (rings.length === 0) return null;
  return (
    <View className="gap-1">
      <Text variant="label" tone="variant">
        On your computers
      </Text>
      {rings.map((ring) => (
        <RingRow key={ring.key} ring={ring} />
      ))}
    </View>
  );
}
