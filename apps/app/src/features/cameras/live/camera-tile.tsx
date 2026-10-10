import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ScopedTheme } from 'uniwind';
import { useContextMenu } from '../../../components/menu';
import { StatusChip } from '../../../components/status-chip';
import { EdgeScrim } from '../../../components/edge-scrim';
import { Text } from '../../../components/text';
import { CardPicture } from '../components/card-picture';
import { cameraStatusOf, useCardMenu } from './tile-status';
import { useCameraCondition } from '../data/use-camera-condition';
import type { CameraEntry } from '../logic/cameras';

export interface CameraTileProps {
  readonly entry: CameraEntry;
  readonly live: boolean;
}

export function CameraTile({ entry, live }: CameraTileProps): ReactNode {
  const condition = useCameraCondition(entry);
  const status = cameraStatusOf(condition);
  const menu = useContextMenu(useCardMenu(entry), entry.name);
  const [hovered, setHovered] = useState(false);
  return (
    <View
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      className="h-full w-full overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-2 elevation-1"
    >
      <CardPicture entry={entry} live={live} hovered={hovered} onMenu={menu.onLongPress} />
      <ScopedTheme theme="dark">
        <View
          pointerEvents="none"
          className="absolute inset-x-0 bottom-0 flex-row items-end gap-2 px-3 pb-2 pt-10"
        >
          <EdgeScrim edge="bottom" />
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
            {entry.name}
          </Text>
          {status === null ? null : <StatusChip {...status} />}
        </View>
      </ScopedTheme>
      {menu.host}
    </View>
  );
}
