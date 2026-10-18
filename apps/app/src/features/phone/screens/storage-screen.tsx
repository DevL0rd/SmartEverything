import type { ReactNode } from 'react';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DetailSectionGate } from '../components/detail-section-gate';
import { PhoneFrame } from '../frame/phone-frame';
import { LargestAppsCard } from '../storage/largest-apps-card';
import { StorageCard } from '../storage/storage-card';
import { needsUsageAccess } from '../storage/storage-model';
import { PageCards, usePersonName } from './detail-parts';

export function StorageBody({ device }: { readonly device: Device }): ReactNode {
  const person = usePersonName(device);
  return (
    <DetailSectionGate
      device={device}
      name="storage"
      noun="Storage"
      lockedText={`Storage stays with ${person} and the owner`}
    >
      {(storage, { view }) => (
        <PageCards
          cards={[
            {
              key: 'storage',
              node: (
                <StorageCard
                  storage={storage}
                  needsAccess={needsUsageAccess(storage, view.own)}
                  offline={!device.online}
                />
              ),
            },
            {
              key: 'largest',
              node: <LargestAppsCard storage={storage} own={view.own} person={person} />,
            },
          ]}
        />
      )}
    </DetailSectionGate>
  );
}

export function PhoneStorageScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <PhoneFrame deviceId={deviceId} title="Storage" width="detail">
      {device?.kind === 'phone' ? <StorageBody device={device} /> : null}
    </PhoneFrame>
  );
}
