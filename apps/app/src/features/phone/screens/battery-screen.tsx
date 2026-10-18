import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { BatteryChartCard } from '../battery/chart-card';
import { HealthCard, MemoryCard } from '../battery/health-card';
import { BatteryHero } from '../battery/hero-card';
import { PhoneCardGrid } from '../frame/phone-grid';
import { PhonePage } from '../frame/phone-page';

type BatteryCard = 'health' | 'memory';

const CARDS: readonly BatteryCard[] = ['health', 'memory'];

export function PhoneBatteryBody({ device }: { readonly device: Device }): ReactNode {
  return (
    <>
      <BatteryHero device={device} />
      <BatteryChartCard device={device} />
      <PhoneCardGrid
        items={CARDS}
        keyOf={(card) => card}
        render={(card) =>
          card === 'health' ? <HealthCard device={device} /> : <MemoryCard device={device} />
        }
      />
    </>
  );
}

export function PhoneBatteryScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <PhonePage deviceId={deviceId} title="Battery" width="detail">
      {(device) => <PhoneBatteryBody device={device} />}
    </PhonePage>
  );
}
