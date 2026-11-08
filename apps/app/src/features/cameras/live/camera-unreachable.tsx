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

function OfflineContent({
  entry,
  lastSeen,
}: {
  readonly entry: CameraEntry;
  readonly lastSeen: CameraCondition['lastSeen'];
}): ReactNode {
  const small = useWidgetFace().cls === 's';
  return (
    <View className="flex-1 gap-2 bg-linear-160 from-surface-3 to-surface-2 p-card-pad">
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
      ) : null}
      <View className="gap-0.5">
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {entry.name}
        </Text>
        <LastSeen lastSeen={lastSeen} />
      </View>
      {small ? null : (
        <Text variant="label" tone="primary" numberOfLines={1} className="mt-auto self-end">
          Check connection
        </Text>
      )}
    </View>
  );
}

export function CameraUnreachable({
  entry,
  lastSeen,
  editing,
}: {
  readonly entry: CameraEntry;
  readonly lastSeen: CameraCondition['lastSeen'];
  readonly editing: boolean;
}): ReactNode {
  const menu = useContextMenu(useCardMenu(entry), entry.name);
  const content = <OfflineContent entry={entry} lastSeen={lastSeen} />;
  return (
    <WidgetSurface>
      {editing ? (
        content
      ) : (
        <Interactive
          href={href.camera(entry.device.id)}
          label={`${entry.name}. ${MESSAGE}`}
          hint="Hold for more"
          onLongPress={menu.onLongPress}
          onContextMenu={menu.onContextMenu}
          className="flex-1"
        >
          {content}
        </Interactive>
      )}
      {menu.host}
    </WidgetSurface>
  );
}
