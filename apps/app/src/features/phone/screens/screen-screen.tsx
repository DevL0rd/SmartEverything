import type { ReactNode } from 'react';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneAccess } from '../card/use-phone-face';
import { usePhoneSection } from '../data/phone-detail';
import { PhoneFrame } from '../frame/phone-frame';
import { BrightnessCard } from '../screen/brightness-card';
import { ScreenTimeCard } from '../screen/screen-time-card';
import { SystemTogglesCard } from '../screen/system-toggles-card';
import { TimeoutCard } from '../screen/timeout-card';
import { UnlocksCard } from '../screen/unlocks-card';
import { PageCards, PendingCards, usePersonName } from './detail-parts';

export function ScreenBody({ device }: { readonly device: Device }): ReactNode {
  const screen = usePhoneSection(device.id, 'screen');
  const access = usePhoneAccess(device);
  const person = usePersonName(device);
  if (screen === undefined) return <PendingCards />;
  const { canAct, own } = access.view;
  const offline = !device.online;
  return (
    <PageCards
      cards={[
        {
          key: 'time',
          node: <ScreenTimeCard usage={screen.usage} own={own} person={person} offline={offline} />,
        },
        screen.usage === null
          ? null
          : {
              key: 'unlocks',
              node: <UnlocksCard unlocks={screen.usage.unlocksToday} offline={offline} />,
            },
        {
          key: 'brightness',
          node: (
            <BrightnessCard
              device={device}
              level={screen.brightness}
              auto={screen.auto}
              writable={screen.writable}
              canAct={canAct}
              person={person}
            />
          ),
        },
        { key: 'timeout', node: <TimeoutCard device={device} screen={screen} canAct={canAct} /> },
        {
          key: 'system',
          node: (
            <SystemTogglesCard
              device={device}
              writable={screen.writable}
              canAct={canAct}
              own={own}
              person={person}
            />
          ),
        },
      ]}
    />
  );
}

export function PhoneScreenScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return (
    <PhoneFrame deviceId={deviceId} title="Screen" width="detail">
      {device?.kind === 'phone' ? <ScreenBody device={device} /> : null}
    </PhoneFrame>
  );
}
