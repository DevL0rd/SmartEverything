import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { MetricStrip } from '../../../components/metric-strip';
import { useAreaWidth } from '../../../design/size-class';
import { useDeviceDerived } from '../../../store/selectors';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { useSeriesSet } from '../data/series-set';
import {
  STRIP_SERIES,
  readingsOfHeadlines,
  readingsOfSummary,
  stripColumnsOf,
  stripItems,
  type StripReadings,
  type StripSeries,
} from '../model/computer-strip';

const IDS: readonly string[] = STRIP_SERIES;
const NO_TOPICS = [] as const;

function seriesOf(lists: ReturnType<typeof useSeriesSet>): StripSeries {
  return {
    'summary/cpuLoad': lists[0] ?? [],
    'summary/gpuLoad': lists[1] ?? [],
    'summary/memoryPercent': lists[2] ?? [],
    'summary/downloadRate': lists[3] ?? [],
    'summary/batteryLevel': lists[4] ?? [],
    'summary/totalWatts': lists[5] ?? [],
  };
}

function StripTiles({
  deviceId,
  offline,
  readings,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
  readonly readings: StripReadings | undefined;
}): ReactNode {
  const lists = useSeriesSet(deviceId, IDS);
  const items = stripItems({
    readings,
    series: seriesOf(lists),
    offline,
    target: (page) => href.settings.device(deviceId, page),
  });
  const columns = stripColumnsOf(useAreaWidth());
  return (
    <MetricStrip items={items} columns={{ compact: columns, medium: columns, expanded: columns }} />
  );
}

function LiveStrip({ deviceId }: { readonly deviceId: string }): ReactNode {
  const readings = useComputerSelect(
    deviceId,
    (parts) => (parts.summary === undefined ? undefined : readingsOfSummary(parts.summary)),
    sameJson,
  );
  return <StripTiles deviceId={deviceId} offline={false} readings={readings} />;
}

function HeldStrip({ deviceId }: { readonly deviceId: string }): ReactNode {
  const readings = useDeviceDerived(deviceId, readingsOfHeadlines, [], sameJson);
  return <StripTiles deviceId={deviceId} offline readings={readings} />;
}

export function ComputerStrip({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  return (
    <DemandRegion deviceId={deviceId} topics={NO_TOPICS}>
      {offline ? <HeldStrip deviceId={deviceId} /> : <LiveStrip deviceId={deviceId} />}
    </DemandRegion>
  );
}
