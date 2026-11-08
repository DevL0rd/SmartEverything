import type { PrinterOverview } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Badge } from '../../../components/badge';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import type { FrameClass } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { WideArt, useWideArt } from '../../../features/devices';
import { DeviceVisual, usePrinterLive, type PrinterLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { WAITING } from '../components/printer-card';
import { RING_TONE, StateRing } from '../components/state-ring';
import { SupplyBars, SupplyTanks, tanksFit } from '../components/supply-band';
import { usePrinterView } from '../data/use-printer-view';
import { lowestLine } from '../model/chips';
import { countLabel } from '../model/format';
import { statusOf } from '../model/status';

function Headline({ live }: { readonly live: PrinterLive }): ReactNode {
  const status = statusOf(live);
  const line = lowestLine(live);
  return (
    <>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          variant="title-3"
          tone={RING_TONE[status.tone]}
          numberOfLines={1}
          className="min-w-0 shrink"
        >
          {status.text}
        </Text>
        {live.queued > 0 ? (
          <Badge label={`${countLabel(live.queued, 'job')} queued`} tone="neutral" />
        ) : null}
      </View>
      {line === null ? null : (
        <Text variant="callout" tone="warning" numberOfLines={2}>
          {line}
        </Text>
      )}
      {status.progress === null ? null : (
        <ProgressBar progress={status.progress} colour="primary" label="Job progress" />
      )}
    </>
  );
}

function Week({ today }: { readonly today: PrinterOverview['today'] }): ReactNode {
  const text = `${String(today.pagesWeek)} of ${String(today.weeklyBudget)} pages this week`;
  return (
    <View className="gap-1">
      <ProgressBar
        progress={Math.min(1, today.pagesWeek / Math.max(1, today.weeklyBudget))}
        colour={today.pagesWeek > today.weeklyBudget ? 'warning' : 'primary'}
        label={text}
      />
      <Text variant="caption" tone="variant" className="tabular" numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function Ring({ live }: { readonly live: PrinterLive }): ReactNode {
  const status = statusOf(live);
  return (
    <StateRing
      tone={status.tone}
      progress={status.progress}
      title={status.text}
      caption={live.queued > 0 ? countLabel(live.queued, 'job') : 'No jobs'}
      size={96}
    />
  );
}

function Supplies({ live }: { readonly live: PrinterLive }): ReactNode {
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = (event: LayoutChangeEvent): void => {
    setWidth(event.nativeEvent.layout.width);
  };
  return (
    <View className="min-w-0 flex-1" onLayout={onLayout}>
      {width === null || tanksFit(width, live.supplies.length) ? (
        <SupplyTanks live={live} compact />
      ) : (
        <SupplyBars live={live} />
      )}
    </View>
  );
}

function Art({ device }: { readonly device: Device }): ReactNode {
  const art = useWideArt();
  return (
    <WideArt cls={art.cls}>
      <DeviceVisual device={device} size="card" px={art.px} />
    </WideArt>
  );
}

function Lane({
  cls,
  live,
  week,
}: {
  readonly cls: FrameClass;
  readonly live: PrinterLive;
  readonly week: PrinterOverview['today'] | undefined;
}): ReactNode {
  const weekRow = week === undefined || cls === 'w' ? null : <Week today={week} />;
  if (cls === 'xl') {
    return (
      <View className="min-w-0 flex-1 flex-row items-start gap-4">
        <View className="min-w-0 flex-1 gap-2">
          <Headline live={live} />
          {weekRow}
        </View>
        <Ring live={live} />
        <Supplies live={live} />
      </View>
    );
  }
  return (
    <View className={cn('min-w-0 flex-1 gap-2', cls === 'w' && 'flex-row items-start gap-4')}>
      <View className="min-w-0 flex-1 gap-2">
        <Headline live={live} />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <SupplyBars live={live} />
        {weekRow}
      </View>
    </View>
  );
}

export function StatusFace({ device }: { readonly device: Device }): ReactNode {
  const { cls } = useWidgetFace();
  const live = usePrinterLive(device);
  const overview = usePrinterView(device, 'overview', {}, cls === 'xl' || cls === 'l');
  return (
    <View className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}>
      <Art device={device} />
      {live === null ? (
        <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
          {WAITING}
        </Text>
      ) : (
        <Lane cls={cls} live={live} week={overview.data?.today} />
      )}
    </View>
  );
}
