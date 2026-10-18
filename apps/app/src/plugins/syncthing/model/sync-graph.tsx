import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import type { ChartPoint } from '../../../components/charts';
import { useDeviceSeries } from '../../../queries/history';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { LinesGraph } from '../../shared/cell-graph';
import { MIN_LINE_POINTS } from '../../shared/cell-graph-model';
import { useSourceLive } from '../../shared/use-source-live';
import { SYNC_DOWNLOAD, SYNC_UPLOAD, syncReadings } from './sync-live';

const HISTORY_HOURS = 24;
const EMPTY: readonly ChartPoint[] = [];

interface GraphProps {
  readonly device: Device;
  readonly live: boolean;
  readonly height: number;
  readonly faint: boolean;
}

function Lines({
  incoming,
  outgoing,
  height,
  faint,
}: {
  readonly incoming: readonly ChartPoint[];
  readonly outgoing: readonly ChartPoint[];
  readonly height: number;
  readonly faint: boolean;
}): ReactNode {
  return (
    <LinesGraph
      height={height}
      faint={faint}
      empty="No transfers yet"
      lines={[
        { points: incoming, colour: 'viz-1', area: true },
        { points: outgoing, colour: 'viz-2', area: false },
      ]}
    />
  );
}

function History({ device, live, height, faint }: GraphProps): ReactNode {
  const incoming = useDeviceSeries(device.id, 'sync_download_rate', HISTORY_HOURS, live).data;
  const outgoing = useDeviceSeries(device.id, 'sync_upload_rate', HISTORY_HOURS, live).data;
  return (
    <Lines
      incoming={incoming ?? EMPTY}
      outgoing={outgoing ?? EMPTY}
      height={height}
      faint={faint}
    />
  );
}

function Live({ device, live, height, faint }: GraphProps): ReactNode {
  const ringIn = useLiveSeries(device.id, SYNC_DOWNLOAD);
  const ringOut = useLiveSeries(device.id, SYNC_UPLOAD);
  const storedIn = useDeviceSeries(device.id, 'sync_download_rate', HISTORY_HOURS, live).data;
  const storedOut = useDeviceSeries(device.id, 'sync_upload_rate', HISTORY_HOURS, live).data;
  const ring = ringIn.length >= MIN_LINE_POINTS;
  return (
    <Lines
      incoming={ring ? ringIn : (storedIn ?? EMPTY)}
      outgoing={ring ? ringOut : (storedOut ?? EMPTY)}
      height={height}
      faint={faint}
    />
  );
}

export function SyncGraph(props: GraphProps): ReactNode {
  return props.live ? <Live {...props} /> : <History {...props} />;
}

export function SyncHold({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: SyncthingSnapshot;
}): ReactNode {
  useSourceLive(device, snapshot, syncReadings);
  return null;
}
