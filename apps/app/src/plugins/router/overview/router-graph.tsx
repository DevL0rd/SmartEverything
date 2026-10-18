import { useMemo, type ReactNode } from 'react';
import type { RouterSnapshot } from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import { useDeviceSeries } from '../../../queries/history';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { LinesGraph } from '../../shared/cell-graph';
import { MIN_LINE_POINTS } from '../../shared/cell-graph-model';
import { useSourceLive } from '../../shared/use-source-live';
import { ROUTER_DOWNLOAD, ROUTER_UPLOAD, routerReadings } from './router-live';
import { megabitPoints } from './traffic-model';

const HISTORY_HOURS = 24;
const EMPTY: readonly ChartPoint[] = [];

interface GraphProps {
  readonly device: Device;
  readonly live: boolean;
  readonly height: number;
  readonly faint: boolean;
}

function useMegabits(points: readonly ChartPoint[] | undefined): readonly ChartPoint[] {
  return useMemo(() => megabitPoints(points ?? EMPTY), [points]);
}

function Lines({
  download,
  upload,
  height,
  faint,
}: {
  readonly download: readonly ChartPoint[];
  readonly upload: readonly ChartPoint[];
  readonly height: number;
  readonly faint: boolean;
}): ReactNode {
  return (
    <LinesGraph
      height={height}
      faint={faint}
      empty="No data yet"
      lines={[
        { points: download, colour: 'viz-1', area: true },
        { points: upload, colour: 'viz-2', area: false },
      ]}
    />
  );
}

function History({ device, live, height, faint }: GraphProps): ReactNode {
  const download = useMegabits(
    useDeviceSeries(device.id, 'download_rate', HISTORY_HOURS, live).data,
  );
  const upload = useMegabits(useDeviceSeries(device.id, 'upload_rate', HISTORY_HOURS, live).data);
  return <Lines download={download} upload={upload} height={height} faint={faint} />;
}

function Live({ device, live, height, faint }: GraphProps): ReactNode {
  const ringDown = useMegabits(useLiveSeries(device.id, ROUTER_DOWNLOAD));
  const ringUp = useMegabits(useLiveSeries(device.id, ROUTER_UPLOAD));
  const storedDown = useMegabits(
    useDeviceSeries(device.id, 'download_rate', HISTORY_HOURS, live).data,
  );
  const storedUp = useMegabits(useDeviceSeries(device.id, 'upload_rate', HISTORY_HOURS, live).data);
  const ring = ringDown.length >= MIN_LINE_POINTS;
  return (
    <Lines
      download={ring ? ringDown : storedDown}
      upload={ring ? ringUp : storedUp}
      height={height}
      faint={faint}
    />
  );
}

export function RouterGraph(props: GraphProps): ReactNode {
  return props.live ? <Live {...props} /> : <History {...props} />;
}

export function RouterHold({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
}): ReactNode {
  useSourceLive(device, snapshot, routerReadings);
  return null;
}
