import type { ReactNode } from 'react';
import { useDevice, useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { usePhoneSection } from '../data/phone-detail';
import { PhoneFrame } from '../frame/phone-frame';
import { usePhoneAccess } from '../card/use-phone-face';
import { phoneReadingsOf } from '../phone-values';
import { FindCard } from '../sound/find-card';
import { ModeCard } from '../sound/mode-card';
import { NowPlayingCard } from '../sound/now-playing-card';
import { VolumeCard } from '../sound/volume-card';
import { PageCards, usePersonName } from './detail-parts';

export function SoundBody({ device }: { readonly device: Device }): ReactNode {
  const readings = useDeviceDerived(device.id, phoneReadingsOf, [], sameJson);
  const sound = usePhoneSection(device.id, 'sound');
  const access = usePhoneAccess(device);
  const person = usePersonName(device);
  const { canAct } = access.view;
  return (
    <PageCards
      cards={[
        { key: 'mode', node: <ModeCard device={device} readings={readings} access={access} /> },
        {
          key: 'playing',
          node: (
            <NowPlayingCard
              device={device}
              sound={sound}
              readings={readings}
              canAct={canAct}
              person={person}
              hidden={!access.view.own}
            />
          ),
        },
        {
          key: 'volumes',
          node: (
            <VolumeCard
              device={device}
              sound={sound}
              readings={readings}
              canAct={canAct}
              person={person}
            />
          ),
        },
        {
          key: 'find',
          node: (
            <FindCard
              device={device}
              access={access}
              ringing={readings.ringing === true}
              person={person}
            />
          ),
        },
      ]}
    />
  );
}

export function PhoneSoundScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <PhoneFrame deviceId={deviceId} title="Sound" width="detail">
      {device?.kind === 'phone' ? <SoundBody device={device} /> : null}
    </PhoneFrame>
  );
}
