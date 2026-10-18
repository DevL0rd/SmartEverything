import type { ReactNode } from 'react';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { Unavailable, useSectionOffered } from '../components/unavailable';
import { Adapters } from './adapters';
import { Wireless } from './wireless';

const TOPICS = ['network', 'system'] as const;

function Network({ device }: { readonly device: Device }): ReactNode {
  const offered = useSectionOffered(device, 'network');
  return (
    <ComputerFrame deviceId={device.id} title="Network" subtitle={device.label} width="dashboard">
      {offered ? (
        <DemandRegion deviceId={device.id} topics={TOPICS} className="gap-section-gap">
          <Adapters device={device} />
          <Wireless device={device} />
        </DemandRegion>
      ) : (
        <Unavailable device={device} sectionId="network" />
      )}
    </ComputerFrame>
  );
}

export function ComputerNetworkScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'computer') {
    return (
      <ComputerFrame deviceId={deviceId} title="Network">
        {null}
      </ComputerFrame>
    );
  }
  return <Network device={device} />;
}
