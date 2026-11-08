import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { frameClassOf, type WidgetFrameBox } from '../../../components/widget-board';
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

export const WAITING = 'Waiting for the printer…';

function Chip({ live }: { readonly live: PrinterLive }): ReactNode {
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
}: {
  readonly device: Device;
  readonly showRoom: boolean;
}): ReactNode {
  const live = usePrinterLive(device);
  const room = useRoomName(device.id);
  const line = live === null ? WAITING : (lowestLine(live) ?? statusOf(live).text);
  return (
    <View className="flex-1 flex-row items-start gap-3">
      <DeviceVisual device={device} size="tile" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
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

function figuresOf(live: PrinterLive): ReactNode[] {
  const { lowest } = live;
  const level = lowest?.level ?? null;
  const lowestFigure =
    lowest === null || level === null
      ? []
      : [
          <WideFigure
            key="lowest"
            value={String(Math.round(level))}
            unit="%"
            caption={`Lowest · ${supplyCopy(lowest.detail, level, lowest.standing).code}`}
            tone={lowest.standing === 'ok' ? 'default' : 'warning'}
            stale={!live.online}
          />,
        ];
  return [
    ...lowestFigure,
    <WideFigure
      key="queued"
      value={String(live.queued)}
      caption={live.queued === 1 ? 'Job queued' : 'Jobs queued'}
      stale={!live.online}
    />,
  ];
}

function PrinterState({ live }: { readonly live: PrinterLive }): ReactNode {
  const detail = fixCardsOf(live)[0]?.title;
  return detail === undefined || detail === statusOf(live).text ? null : (
    <Text variant="footnote" tone="variant" numberOfLines={2}>
      {detail}
    </Text>
  );
}

function Wide({ device, cls }: { readonly device: Device; readonly cls: WideClass }): ReactNode {
  const live = usePrinterLive(device);
  const room = useRoomName(device.id);
  const named = `${device.label}${room === null ? '' : `, ${room}`}`;
  const visual = <DeviceVisual device={device} size="card" px={WIDE_VISUAL_PX[cls]} />;
  if (live === null) {
    return (
      <WideCard
        cls={cls}
        summary={`${named}. ${WAITING}`}
        visual={visual}
        title={device.label}
        titleLines={2}
        state={
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {WAITING}
          </Text>
        }
      />
    );
  }
  const jobs = live.queued === 1 ? 'job' : 'jobs';
  return (
    <WideCard
      cls={cls}
      summary={`${named}. ${statusOf(live).text}. ${String(live.queued)} ${jobs} queued.`}
      visual={visual}
      title={device.label}
      titleLines={2}
      chip={<Chip live={live} />}
      state={<PrinterState live={live} />}
      figures={figuresOf(live)}
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
    <PrinterTile device={device} showRoom />
  );
}
