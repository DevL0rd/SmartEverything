import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ThemeScope } from '../../../design/theme-scope';
import { useContextMenu } from '../../../components/menu';
import { StatusChip } from '../../../components/status-chip';
import { EdgeScrim } from '../../../components/edge-scrim';
import { Text } from '../../../components/text';
import { CardPicture } from '../components/card-picture';
import { cameraStatusOf, useCardMenu } from './tile-status';
import type { CameraEntry } from '../logic/cameras';
import type { CameraCondition } from '../player/player-state';

export interface CameraTileProps {
  readonly entry: CameraEntry;
  readonly editing: boolean;
  readonly condition: CameraCondition;
}

export function CameraTile({ entry, condition, editing }: CameraTileProps): ReactNode {
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
      <CardPicture entry={entry} hovered={hovered} onMenu={menu.onLongPress} editing={editing} />
      <ThemeScope theme="dark">
        <View
          pointerEvents="none"
          className="absolute inset-x-0 top-0 flex-row items-start gap-2 px-card-pad pb-10 pt-card-pad"
        >
          <EdgeScrim edge="top" />
          <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
            {entry.name}
          </Text>
          {status === null ? null : <StatusChip {...status} />}
        </View>
      </ThemeScope>
      {menu.host}
    </View>
  );
}
