import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { ReasonLine } from '../../../components/reason-line';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import type { PhoneTier } from '@smarteverything/domain';
import { usePhoneAccess } from '../card/use-phone-face';
import { featureState, featuresOf } from '../model/face-model';
import { usePhoneSection } from '../data/phone-detail';
import { usePhoneLiveHeld } from '../data/phone-live';
import { PhoneFrame } from '../frame/phone-frame';
import { BluetoothCard } from '../network/bluetooth-card';
import { ConnectionCard } from '../network/connection-card';
import { DataCard } from '../network/data-card';
import { MobileCard } from '../network/mobile-card';
import type { Bluetooth } from '../network/network-model';
import { SignalCard } from '../network/signal-card';
import { LockLine, PageCards, PendingCards, usePersonName } from './detail-parts';

const SWITCH_NOTE = 'Wi-Fi, Bluetooth and mobile data can only be switched on the phone';

function Connections({
  device,
  devices,
  tier,
  person,
}: {
  readonly device: Device;
  readonly devices: readonly Bluetooth[] | undefined;
  readonly tier: PhoneTier;
  readonly person: string;
}): ReactNode {
  if (devices === undefined) {
    return (
      <Card title="Bluetooth" icon="bluetooth">
        <LockLine text={`Connected devices stay with ${person} and the owner`} />
      </Card>
    );
  }
  const permission = featureState(featuresOf(device.details), 'bluetooth');
  return (
    <BluetoothCard
      devices={devices}
      hidden={tier !== 'person' && devices.length > 0}
      person={person}
      needsPermission={tier === 'person' && permission === 'needs_permission'}
    />
  );
}

export function NetworkBody({ device }: { readonly device: Device }): ReactNode {
  const network = usePhoneSection(device.id, 'network');
  const connections = usePhoneSection(device.id, 'connections');
  const { view } = usePhoneAccess(device);
  const live = usePhoneLiveHeld(device.id);
  const person = usePersonName(device);
  if (network === undefined) return <PendingCards />;
  const offline = !device.online;
  return (
    <>
      <PageCards
        cards={[
          {
            key: 'connection',
            node: (
              <ConnectionCard
                network={network}
                showName={view.own}
                live={live}
                person={person}
                offline={offline}
              />
            ),
          },
          { key: 'signal', node: <SignalCard network={network} live={live} offline={offline} /> },
          network.cellular === null
            ? null
            : { key: 'mobile', node: <MobileCard cellular={network.cellular} offline={offline} /> },
          { key: 'data', node: <DataCard data={network.data} own={view.own} person={person} /> },
          {
            key: 'bluetooth',
            node: (
              <Connections
                device={device}
                devices={connections?.bluetooth}
                tier={view.tier}
                person={person}
              />
            ),
          },
        ]}
      />
      <ReasonLine text={SWITCH_NOTE} />
    </>
  );
}

export function PhoneNetworkScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <PhoneFrame deviceId={deviceId} title="Network" width="detail">
      {device?.kind === 'phone' ? <NetworkBody device={device} /> : null}
    </PhoneFrame>
  );
}
