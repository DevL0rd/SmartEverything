import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DeviceVisual } from '../../device-visuals';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { isWideClass, WIDE_VISUAL_PX, WideCard, type WideClass } from '../card/wide-card';
import { LogTicker } from '../log/log-ticker';
import { meaningLine } from './press-model';
import { PressMenu } from './press-menu';
import { PressStrip } from './press-strip';
import { RoomChip } from './status-chip';
import { useButtonView } from './use-button-view';

const NOT_USED = 'Not used yet';
const HUB_OFFLINE = 'The hub that hears this button is offline';
const STRIP_PX: Readonly<Record<WideClass, number>> = { m: 16, w: 28, l: 48, xl: 48 };

function stateLineOf(device: Device, line: string | null): string {
  return device.online ? (line ?? NOT_USED) : HUB_OFFLINE;
}

function WideButton({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const view = useButtonView(device.id);
  const room = useRoomName(device.id);
  const line = stateLineOf(device, meaningLine(view.meaning));
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={`${device.label}${room === null ? '' : `, ${room}`}. ${line}`}
        visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={<RoomChip online={device.online} room={room} />}
        state={
          <Text variant="footnote" tone="variant" numberOfLines={cls === 'm' ? 1 : 2}>
            {line}
          </Text>
        }
        graph={<PressStrip segments={view.strip} window={view.window} height={STRIP_PX[cls]} />}
        actions={[<PressMenu key="press" deviceId={device.id} meaning={view.meaning} />]}
        ticker={
          <LogTicker deviceId={device.id} live={live} lines={cls === 'l' || cls === 'xl' ? 2 : 1} />
        }
      />
    </View>
  );
}

export function ButtonCard(props: CardFaceProps): ReactNode {
  return isWideClass(props.cls) ? (
    <WideButton device={props.device} cls={props.cls} />
  ) : (
    <GenericCardFace {...props} />
  );
}
