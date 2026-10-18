import type { ReactNode } from 'react';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { Unavailable, useSectionOffered } from '../components/unavailable';
import { Drives } from './drives';

const TOPICS = ['disks'] as const;

function Storage({ device }: { readonly device: Device }): ReactNode {
  const offered = useSectionOffered(device, 'storage');
  return (
    <ComputerFrame deviceId={device.id} title="Storage" subtitle={device.label} width="dashboard">
      {offered ? (
        <DemandRegion deviceId={device.id} topics={TOPICS}>
          <Drives device={device} />
        </DemandRegion>
      ) : (
        <Unavailable device={device} sectionId="storage" />
      )}
    </ComputerFrame>
  );
}

export function ComputerStorageScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  if (device?.kind !== 'computer') {
    return (
      <ComputerFrame deviceId={deviceId} title="Storage">
        {null}
      </ComputerFrame>
    );
  }
  return <Storage device={device} />;
}
