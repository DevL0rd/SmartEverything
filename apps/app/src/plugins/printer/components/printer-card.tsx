import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
import { cn } from '../../../design/cn';
import {
  WIDE_VISUAL_PX,
  WideCard,
  WideFigure,
  isWideClass,
  type WideClass,
} from '../../../features/devices';
import { DeviceVisual, usePrinterLive, type PrinterLive } from '../../../features/device-visuals';
import { useRoomName } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { fixCardsOf, lowestLine } from '../model/chips';
import { supplyCopy } from '../model/supply-copy';
import { statusOf } from '../model/status';
import { RING_BADGE, RING_TONE } from './state-ring';
import { SupplyBars } from './supply-band';

function Chip({ device }: { readonly device: Device }): ReactNode {
  const live = usePrinterLive(device);
  if (live === null) return null;
  const status = statusOf(live);
  return (
    <View className="shrink-0">
      <Badge label={status.text} tone={RING_BADGE[status.tone]} />
    </View>
  );
}

export function PrinterTile({
  device,
  showRoom,
  compact,
}: {
  readonly device: Device;
  readonly showRoom: boolean;
  readonly compact: boolean;
}): ReactNode {
  const live = usePrinterLive(device);
  const room = useRoomName(device.id);
  const line =
    live === null ? 'Waiting for the printer…' : (lowestLine(live) ?? statusOf(live).text);
  return (
    <View className={cn('flex-1 justify-between gap-2', !compact && 'flex-row items-center')}>
      <DeviceVisual device={device} size="tile" />
      <View className="min-w-0 gap-0.5">
        <Text variant="body-strong" numberOfLines={compact ? 2 : 1}>
          {device.label}
        </Text>
        {showRoom && room !== null ? (
          <Text variant="footnote" tone="variant" numberOfLines={1}>
            {room}
          </Text>
        ) : null}
        <Text
          variant="footnote"
          tone={live === null ? 'variant' : RING_TONE[statusOf(live).tone]}
          numberOfLines={2}
        >
          {line}
        </Text>
      </View>
    </View>
  );
}

function Figures({ live }: { readonly live: PrinterLive }): ReactNode {
  const { lowest } = live;
  const level = lowest?.level ?? null;
  return (
    <View className="flex-row items-end gap-4">
      {lowest === null || level === null ? null : (
        <WideFigure
          value={String(Math.round(level))}
          unit="%"
          caption={`Lowest · ${supplyCopy(lowest.detail, level, lowest.standing).code}`}
          tone={lowest.standing === 'ok' ? 'default' : 'warning'}
          stale={!live.online}
        />
      )}
      <WideFigure
        value={String(live.queued)}
        caption={live.queued === 1 ? 'Job queued' : 'Jobs queued'}
        stale={!live.online}
      />
    </View>
  );
}

function Wide({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  const live = usePrinterLive(device);
  const room = useRoomName(device.id);
  if (live === null) return <PrinterTile device={device} showRoom compact />;
  const state = statusOf(live).text;
  return (
    <WideCard
      cls={cls}
      summary={`${device.label}${room === null ? '' : `, ${room}`}. ${state}`}
      visual={<DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />}
      title={device.label}
      chip={<Chip device={device} />}
      state={
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {fixCardsOf(live)[0]?.title ?? state}
        </Text>
      }
      figures={[<Figures key="figures" live={live} />]}
      graph={live.supplies.length === 0 ? null : <SupplyBars live={live} />}
    />
  );
}

export function PrinterCardFace({
  device,
  frame,
}: {
  readonly device: Device;
  readonly frame: WidgetFrameBox;
  readonly size: string;
}): ReactNode {
  const cls = frameClassOf(frame);
  return isWideClass(cls) ? (
    <Wide device={device} cls={cls} />
  ) : (
    <PrinterTile device={device} showRoom compact />
  );
}
