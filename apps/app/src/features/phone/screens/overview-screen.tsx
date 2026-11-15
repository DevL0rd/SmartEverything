import type { ReactNode } from 'react';
import { Banner } from '../../../components/banner';
import { useShellRailShown } from '../../../components/page-shell/rail-shown';
import { HOUR_MS } from '../../../format/time';
import type { Device } from '../../../store/state';
import { usePhoneFace } from '../card/use-phone-face';
import { usePhoneSection } from '../data/phone-detail';
import { ParkedCard } from '../activity/parked-card';
import { DoingTodayCard } from '../activity/today-card';
import { PhoneCardGrid } from '../frame/phone-grid';
import { PhonePage } from '../frame/phone-page';
import { AppsCard } from '../overview/apps-card';
import { BatteryCard } from '../overview/battery-card';
import { ConnectionsCard, TodayCard } from '../overview/extras-card';
import { PhoneHero } from '../overview/hero';
import { PhoneStrip } from '../overview/phone-strip';
import { SectionList } from '../overview/section-list';
import { SoundCard } from '../overview/sound-card';

const PARKED_WITHIN_MS = 12 * HOUR_MS;

type OverviewCard = 'battery' | 'doing' | 'sound' | 'apps' | 'connections' | 'today';

const CARDS: readonly OverviewCard[] = [
  'battery',
  'doing',
  'sound',
  'apps',
  'connections',
  'today',
];

function CardOf({
  card,
  device,
}: {
  readonly card: OverviewCard;
  readonly device: Device;
}): ReactNode {
  switch (card) {
    case 'battery':
      return <BatteryCard device={device} />;
    case 'doing':
      return <DoingTodayCard device={device} linked />;
    case 'sound':
      return <SoundCard device={device} />;
    case 'apps':
      return <AppsCard device={device} />;
    case 'connections':
      return <ConnectionsCard device={device} />;
    case 'today':
      return <TodayCard device={device} />;
  }
}

function useOverviewCards(device: Device): readonly OverviewCard[] {
  const { readings, access } = usePhoneFace(device);
  const bluetooth = usePhoneSection(device.id, 'connections')?.bluetooth;
  return CARDS.filter((card) => {
    if (card === 'battery') return readings.battery !== null;
    if (card === 'connections') {
      return access.view.own && bluetooth !== undefined && bluetooth.length > 0;
    }
    if (card === 'today') return access.view.own;
    return true;
  });
}

function PrivacyBanner({ device }: { readonly device: Device }): ReactNode {
  const { access } = usePhoneFace(device);
  if (access.view.own) return null;
  return (
    <Banner
      tone="info"
      title={access.view.canAct ? 'Counts and totals only' : 'You can look, not change'}
      body="App names, notification titles, Wi-Fi names and places stay with this phone’s person."
      wrapBody
    />
  );
}

export function PhoneOverviewBody({ device }: { readonly device: Device }): ReactNode {
  const compact = !useShellRailShown();
  const { access } = usePhoneFace(device);
  const cards = useOverviewCards(device);
  return (
    <>
      <PhoneHero device={device} />
      <PhoneStrip device={device} />
      <PrivacyBanner device={device} />
      {access.view.here ? <ParkedCard maxAgeMs={PARKED_WITHIN_MS} /> : null}
      <PhoneCardGrid
        items={cards}
        keyOf={(card) => card}
        render={(card) => <CardOf card={card} device={device} />}
      />
      {compact ? <SectionList deviceId={device.id} online={device.online} /> : null}
    </>
  );
}

export function PhoneOverviewScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title={null} root>
      {(device) => <PhoneOverviewBody device={device} />}
    </PhonePage>
  );
}
