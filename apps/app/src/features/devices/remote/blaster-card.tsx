import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { href } from '../../../app-shell/hrefs';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { FamilyVisual, visualStateOf, type VisualPx } from '../../device-visuals';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { LiveSpark } from '../card/live-spark';
import {
  isWideClass,
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  type WideClass,
} from '../card/wide-card';
import { UNREACHABLE_REASON } from '../controls/guard';
import { LogTicker } from '../log/log-ticker';
import { useBlasterRemotes, type BlasterRemote } from './blaster-remotes';
import { useClimate, type Climate } from './blaster-climate';
import { RemoteFace } from './remote-face';
import { useDeviceRemoteSource } from './remote-source';

const SPARK_PX: Readonly<Record<WideClass, number>> = { m: 16, w: 28, l: 48, xl: 48 };

function RemoteChips({ remotes }: { readonly remotes: readonly BlasterRemote[] }): ReactNode {
  if (remotes.length === 0) {
    return (
      <Text variant="caption" tone="faint" numberOfLines={1}>
        Remotes: none yet
      </Text>
    );
  }
  return (
    <View
      className="min-w-0 flex-row flex-wrap items-center justify-end gap-1.5"
      pointerEvents="none"
    >
      {remotes.map((remote) => (
        <View
          key={remote.id}
          className="min-w-0 shrink flex-row items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5"
        >
          <Icon name={remote.icon} size={16} tone="variant" />
          <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
            {remote.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ClimateGraph({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  return (
    <View className="gap-1">
      <LiveSpark
        device={device}
        capability="temperature"
        colour="temp-warm"
        height={SPARK_PX[cls]}
      />
      <LiveSpark device={device} capability="humidity" colour="humidity" height={SPARK_PX[cls]} />
    </View>
  );
}

function figuresOf(climate: Climate, stale: boolean): readonly ReactNode[] {
  return [
    climate.temperature === null ? null : (
      <WideFigure
        key="t"
        value={climate.temperature.toFixed(1)}
        unit="°C"
        stale={stale}
        caption="Temperature"
      />
    ),
    climate.humidity === null ? null : (
      <WideFigure
        key="h"
        value={climate.humidity.toFixed(0)}
        unit="%"
        stale={stale}
        caption="Humidity"
      />
    ),
  ].filter((figure) => figure !== null);
}

function BlasterVisual({
  device,
  sentAt,
  px,
}: {
  readonly device: Device;
  readonly sentAt: string | null;
  readonly px: VisualPx;
}): ReactNode {
  const state = {
    ...visualStateOf(device, {}),
    ir: { category: 'other' as const, on: null, assumed: true, failed: false, sentAt },
  };
  return <FamilyVisual family="ir_blaster" state={state} size="card" px={px} />;
}

function AddRemote({
  device,
  remotes,
}: {
  readonly device: Device;
  readonly remotes: readonly BlasterRemote[];
}): ReactNode {
  return (
    <Button
      label="Add a remote"
      icon="plus"
      variant={remotes.length === 0 ? 'filled' : 'text'}
      href={href.settings.device(device.id, 'remotes')}
    />
  );
}

function summaryOf(device: Device, climate: Climate, remotes: number): string {
  const degrees = climate.temperature === null ? '' : `${climate.temperature.toFixed(0)} degrees. `;
  const owned = remotes === 0 ? 'No remotes yet' : `${String(remotes)} remotes`;
  return `${device.label}. ${device.online ? 'Online' : 'Offline'}. ${degrees}${owned}`;
}

function WideBlaster({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const room = useRoomName(device.id);
  const climate = useClimate(device);
  const { remotes, sentAt } = useBlasterRemotes(device.id);
  const panel = cls === 'l' || cls === 'xl';
  return (
    <View ref={ref} onLayout={onLayout} className="flex-1" pointerEvents="box-none">
      <WideCard
        cls={cls}
        summary={summaryOf(device, climate, remotes.length)}
        visual={<BlasterVisual device={device} sentAt={sentAt} px={WIDE_VISUAL_PX[cls]} />}
        title={device.label}
        chip={device.online ? undefined : <Badge label="Offline" icon="wifi" />}
        state={
          device.online ? (
            room === null ? undefined : (
              <Text variant="footnote" tone="variant" numberOfLines={1}>
                {room}
              </Text>
            )
          ) : (
            <Text variant="footnote" tone="critical" numberOfLines={2}>
              {UNREACHABLE_REASON}
            </Text>
          )
        }
        figures={figuresOf(climate, !device.online)}
        graph={<ClimateGraph device={device} cls={cls} />}
        actions={device.online ? [<AddRemote key="add" device={device} remotes={remotes} />] : []}
        ticker={
          <View className="min-w-0 gap-0.5">
            <RemoteChips remotes={remotes} />
            {panel ? <LogTicker deviceId={device.id} live={live} lines={2} /> : null}
          </View>
        }
      />
    </View>
  );
}

function DeviceRemoteCard({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  return <RemoteFace source={useDeviceRemoteSource(device)} cls={cls} />;
}

export function BlasterCard(props: CardFaceProps): ReactNode {
  const { cls, device } = props;
  if (!isWideClass(cls)) {
    return <GenericCardFace {...props} />;
  }
  return device.kind === 'ir_remote' ? (
    <DeviceRemoteCard device={device} cls={cls} />
  ) : (
    <WideBlaster device={device} cls={cls} />
  );
}
