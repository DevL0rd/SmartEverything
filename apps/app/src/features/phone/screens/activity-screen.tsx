import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { ParkedCard } from '../activity/parked-card';
import { DoingTodayCard } from '../activity/today-card';
import { PlacesCard } from '../activity/places-card';
import { WeekCard } from '../activity/week-card';
import { usePhoneFace } from '../card/use-phone-face';
import { PhoneCardGrid } from '../frame/phone-grid';
import { PhonePage } from '../frame/phone-page';

type ActivityCard = 'week' | 'places';

const CARDS: readonly ActivityCard[] = ['week', 'places'];

export function PhoneActivityBody({ device }: { readonly device: Device }): ReactNode {
  const { access } = usePhoneFace(device);
  return (
    <>
      <DoingTodayCard device={device} linked={false} />
      <PhoneCardGrid
        items={CARDS}
        keyOf={(card) => card}
        render={(card) =>
          card === 'week' ? <WeekCard device={device} /> : <PlacesCard device={device} />
        }
      />
      {access.view.here ? <ParkedCard /> : null}
    </>
  );
}

export function PhoneActivityScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title="Activity" width="detail">
      {(device) => <PhoneActivityBody device={device} />}
    </PhonePage>
  );
}
