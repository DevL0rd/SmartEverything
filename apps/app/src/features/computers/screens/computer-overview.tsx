import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { useAreaWidth } from '../../../design/size-class';
import { joinParts } from '../../../format/text';
import { useDevice, useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { useHasGpu } from '../data/computer-headlines';
import { useComputerDetail, useComputerSelect, useComputerStatus } from '../data/computer-metrics';
import { factsOf, isHub } from '../data/computer-device';
import { AiSection } from '../overview/ai-section';
import { OverviewCharts } from '../overview/chart-cards';
import { ComputerStrip } from '../overview/computer-strip';
import { ConnectionSection } from '../overview/connection-section';
import { ComputerHero } from '../overview/hero';
import { MemoryCard } from '../overview/memory-card';
import { OverviewSkeleton } from '../overview/overview-skeleton';
import { SectionList } from '../overview/section-list';
import { NowPlayingCard, VolumeCard } from '../overview/sound-cards';
import { TopProcesses } from '../overview/top-processes';
import { frameLayoutOf, twoColumnsAt } from '../model/sections';
import { uptimeText } from '../model/computer-view';

const TOPICS = ['summary', 'system'] as const;

function useSubtitle(device: Device): string {
  const uptime = useComputerSelect(device.id, (parts) =>
    parts.summary === undefined ? null : uptimeText(parts.summary.uptimeSeconds),
  );
  return joinParts([
    isHub(device) ? 'Hub' : null,
    factsOf(device).os,
    uptime === null ? null : `up ${uptime}`,
  ]);
}

function Columns({
  device,
  owner,
  disabled,
  sections,
}: {
  readonly device: Device;
  readonly owner: boolean;
  readonly disabled: boolean;
  readonly sections: ReactNode;
}): ReactNode {
  const two = twoColumnsAt(useAreaWidth());
  const left = (
    <View className="min-w-0 flex-1 gap-4">
      <MemoryCard deviceId={device.id} online={device.online} />
      <NowPlayingCard deviceId={device.id} disabled={disabled} />
      <VolumeCard device={device} disabled={disabled} />
      <TopProcesses deviceId={device.id} />
      {sections}
    </View>
  );
  const right = (
    <View className="min-w-0 flex-1 gap-6">
      <AiSection device={device} owner={owner} />
      <ConnectionSection device={device} owner={owner} />
    </View>
  );
  return two ? (
    <View className="flex-row items-start gap-4">
      {left}
      {right}
    </View>
  ) : (
    <View className="gap-section-gap">
      {left}
      {right}
    </View>
  );
}

function Body({ device }: { readonly device: Device }): ReactNode {
  const owner = useIsOwner();
  const status = useComputerStatus(device);
  const features = useComputerDetail(device.id, device.online).data?.features;
  const loaded = useComputerSelect(device.id, (parts) => parts.summary !== undefined);
  const hasGpu = useHasGpu(device.id, status.offline);
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  if (!loaded && device.online) return <OverviewSkeleton />;
  return (
    <DemandRegion deviceId={device.id} topics={TOPICS} history={device} className="gap-section-gap">
      <ComputerHero device={device} status={status} />
      <ComputerStrip deviceId={device.id} offline={status.offline} />
      <OverviewCharts deviceId={device.id} hasGpu={hasGpu} offline={status.offline} />
      <Columns
        device={device}
        owner={owner}
        disabled={status.offline}
        sections={
          compact ? (
            <SectionList
              deviceId={device.id}
              online={device.online}
              features={features}
              os={factsOf(device).os}
            />
          ) : null
        }
      />
    </DemandRegion>
  );
}

function Overview({ device }: { readonly device: Device }): ReactNode {
  const subtitle = useSubtitle(device);
  return (
    <ComputerFrame
      deviceId={device.id}
      title={device.label}
      subtitle={subtitle}
      width="dashboard"
      crumbs={[{ label: 'Devices', href: href.devices() }, { label: device.label }]}
    >
      <Body device={device} />
    </ComputerFrame>
  );
}

export function ComputerOverviewScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'computer') {
    return (
      <ComputerFrame deviceId={deviceId} title="Computer">
        <EmptyState
          icon="monitor"
          title="Computer unavailable"
          body="This computer isn’t paired with your home any more."
        />
      </ComputerFrame>
    );
  }
  return <Overview device={device} />;
}
