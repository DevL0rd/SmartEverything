import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import {
  isWideClass,
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  type WideClass,
} from '../card/wide-card';
import { LogTicker } from '../log/log-ticker';
import { childNoun, hubLine, type HubChild, type HubView } from './hub-model';
import { RoomChip } from './status-chip';
import { useHubView } from './use-hub-view';

function ChildStrip({
  kids,
  named,
}: {
  readonly kids: readonly HubChild[];
  readonly named: boolean;
}): ReactNode {
  return (
    <View className="flex-row gap-1.5">
      {kids.map((child) => (
        <View key={child.id} className="min-w-0 flex-1 gap-1">
          <View
            className={cn(
              'h-2.5 rounded-full',
              child.online ? 'bg-positive' : 'bg-outline-variant',
            )}
          />
          {named ? (
            <Text variant="caption" tone={child.online ? 'variant' : 'faint'} numberOfLines={1}>
              {child.name}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function childFigures(view: HubView, online: boolean): readonly ReactNode[] {
  return view.children.length === 0
    ? []
    : [
        <WideFigure
          key="children"
          value={String(view.children.length)}
          caption={childNoun(view)}
          stale={!online}
        />,
      ];
}

function WideGateway({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const view = useHubView(device.id);
  const room = useRoomName(device.id);
  const line = hubLine(view, device.online);
  const named = cls !== 'm';
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={`${device.label}${room === null ? '' : `, ${room}`}. ${line}`}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={<RoomChip online={device.online} room={room} />}
        state={
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {line}
          </Text>
        }
        figures={childFigures(view, device.online)}
        graph={
          view.children.length === 0 ? undefined : <ChildStrip named={named} kids={view.children} />
        }
        ticker={<LogTicker deviceId={device.id} live={live} />}
      />
    </View>
  );
}

export function GatewayCard(props: CardFaceProps): ReactNode {
  return isWideClass(props.cls) ? (
    <WideGateway device={props.device} cls={props.cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
