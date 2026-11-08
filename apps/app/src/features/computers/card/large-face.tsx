import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { NowPlayingRow } from '../components/now-playing';
import { useComputerDetail, useComputerSelect } from '../data/computer-metrics';
import type { ComputerStatus } from '../model/computer-view';
import { TOP_WINDOW, topEntries } from '../model/top-processes';
import { NetworkTile } from './card-text';
import { FaceBand, WakeNote } from './face-controls';
import { FaceHeader } from './face-header';
import { CoreStrip } from './core-strip';
import { VitalRow, type TileLook, type TileLooks } from './vital-parts';

const PROCESS_TOPICS = ['processes'] as const;
const SPARK = 32;
const NET_LOOK: TileLook = { spark: 22, inline: true };
const LOOK: TileLook = { spark: SPARK, inline: false };
const LOOKS: TileLooks = { cpu: LOOK, gpu: LOOK, ram: LOOK };

interface PanelProps {
  readonly device: Device;
  readonly status: ComputerStatus;
}

function Panel({ device, status }: PanelProps): ReactNode {
  const stale = status.offline;
  return (
    <View className="min-w-0 flex-1 gap-3" pointerEvents="none">
      <VitalRow deviceId={device.id} stale={stale} looks={LOOKS} />
      <NetworkTile deviceId={device.id} stale={stale} look={NET_LOOK} />
      {stale ? null : <CoreStrip deviceId={device.id} />}
      <WakeNote device={device} offline={stale} />
    </View>
  );
}

function TopList({ device }: { readonly device: Device }): ReactNode {
  const rows = useComputerSelect(device.id, (parts) => parts.processes?.rows, sameJson);
  return (
    <DemandRegion deviceId={device.id} topics={PROCESS_TOPICS} window={TOP_WINDOW}>
      {rows === undefined ? null : (
        <>
          <Text variant="caption" tone="variant">
            Top processes
          </Text>
          {topEntries(rows).map((entry) => (
            <View key={entry.key} className="min-h-8 flex-row items-center gap-2">
              <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
                {entry.label}
              </Text>
              <Text variant="callout" tone="variant" className="tabular">
                {entry.value}
              </Text>
            </View>
          ))}
        </>
      )}
    </DemandRegion>
  );
}

function TallBody(props: PanelProps): ReactNode {
  const { device, status } = props;
  const scopes = useComputerDetail(device.id, device.online).data?.scopes;
  if (status.offline || scopes?.processes === false) return <Panel {...props} />;
  return (
    <View className="flex-row gap-6" pointerEvents="none">
      <Panel {...props} />
      <View className="min-w-0 flex-1 gap-2">
        <TopList device={device} />
        <NowPlayingRow deviceId={device.id} disabled={false} compact />
      </View>
    </View>
  );
}

export function LargeFace({ tall, ...panel }: PanelProps & { readonly tall: boolean }): ReactNode {
  return (
    <View className="flex-1 gap-3" pointerEvents="box-none">
      <FaceHeader device={panel.device} status={panel.status} compact />
      {tall ? <TallBody {...panel} /> : <Panel {...panel} />}
      <FaceBand device={panel.device} offline={panel.status.offline} controls="full" />
    </View>
  );
}
