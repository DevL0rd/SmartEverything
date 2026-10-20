import type { PrinterOverview } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { DeviceVisual, usePrinterLive, type PrinterLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { RING_TONE, StateRing } from '../components/state-ring';
import { SupplyBars, SupplyTanks } from '../components/supply-band';
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
        <Text variant="callout" tone="warning" numberOfLines={1}>
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
      <Text variant="caption" tone="variant" className="tabular" numberOfLines={1}>
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

export function StatusFace({ device }: { readonly device: Device }): ReactNode {
  const { cls } = useWidgetFace();
  const live = usePrinterLive(device);
  const overview = usePrinterView(device, 'overview', {}, cls === 'xl' || cls === 'l');
  if (live === null) return null;
  const visual = <DeviceVisual device={device} size="card" />;
  if (cls === 'xl') {
    return (
      <View className="flex-1 flex-row items-center gap-4">
        {visual}
        <View className="min-w-0 flex-1 gap-2">
          <Headline live={live} />
          {overview.data === undefined ? null : <Week today={overview.data.today} />}
        </View>
        <Ring live={live} />
        <SupplyTanks live={live} compact />
      </View>
    );
  }
  if (cls === 'w') {
    return (
      <View className="flex-1 flex-row items-center gap-4">
        {visual}
        <View className="min-w-0 flex-1 gap-2">
          <Headline live={live} />
        </View>
        <View className="w-1/2">
          <SupplyBars live={live} />
        </View>
      </View>
    );
  }
  return (
    <View className="flex-1 justify-between gap-3">
      <View className="flex-row items-center gap-4">
        {visual}
        <View className="min-w-0 flex-1 gap-2">
          <Headline live={live} />
        </View>
      </View>
      <SupplyBars live={live} />
      {cls === 'l' && overview.data !== undefined ? <Week today={overview.data.today} /> : null}
    </View>
  );
}
