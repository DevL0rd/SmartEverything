import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useContextMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { WidgetSurface } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import type { CameraEntry } from '../logic/cameras';
import type { CameraCondition } from '../player/player-state';
import { useCardMenu } from './tile-status';

const MESSAGE = 'Can’t reach this camera';

function LastSeen({ lastSeen }: { readonly lastSeen: CameraCondition['lastSeen'] }): ReactNode {
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  return lastSeen === null ? null : (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {`Last seen ${moment(lastSeen, now, timeZone)}`}
    </Text>
  );
}

export function CameraUnreachable({
  entry,
  lastSeen,
}: {
  readonly entry: CameraEntry;
  readonly lastSeen: CameraCondition['lastSeen'];
}): ReactNode {
  const small = useWidgetFace().cls === 's';
  const menu = useContextMenu(useCardMenu(entry), entry.name);
  return (
    <WidgetSurface>
      <Interactive
        href={href.camera(entry.device.id)}
        label={`${entry.name}. ${MESSAGE}`}
        hint="Hold for more"
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        className="flex-1"
      >
        <View className="flex-1 justify-between gap-2 bg-linear-160 from-surface-3 to-surface-2 p-card-pad">
          <View className="flex-row items-center gap-2">
            <Icon name="cameraOff" size={24} />
            {small ? null : (
              <Text variant="callout" numberOfLines={2} className="min-w-0 flex-1">
                {MESSAGE}
              </Text>
            )}
          </View>
          {small ? (
            <Text variant="footnote" numberOfLines={2}>
              {MESSAGE}
            </Text>
          ) : (
            <Text variant="label" tone="primary" numberOfLines={1}>
              Check connection
            </Text>
          )}
          <View className="gap-0.5">
            <Text variant="footnote" tone="variant" numberOfLines={1}>
              {entry.name}
            </Text>
            <LastSeen lastSeen={lastSeen} />
          </View>
        </View>
      </Interactive>
      {menu.host}
    </WidgetSurface>
  );
}
