import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import type { Device } from '../../../store/state';
import { PrimaryControls, usePrimaryControls } from '../controls/primary-controls';
import { useDeviceModel } from '../model/device-model';
import { PhoneHero } from '../../phone';
import { WatchHero } from '../../watches';
import { DeviceHero } from './device-hero';
import { ScaleHero } from './scale-hero';
import { OfflineBanner } from './offline-banner';

const NO_EXCLUSIONS = new Set<never>();

export function Hero({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  if (model.family === 'scale') {
    return <ScaleHero device={device} />;
  }
  if (model.family === 'phone') {
    return <PhoneHero device={device} />;
  }
  if (model.family === 'wearable') {
    return <WatchHero device={device} />;
  }
  return <DeviceHero device={device} />;
}

export function PrimaryCard({ device }: { readonly device: Device }): ReactNode {
  const controls = usePrimaryControls(device, NO_EXCLUSIONS);
  if (controls.length === 0) {
    return null;
  }
  return (
    <Card>
      <PrimaryControls device={device} />
    </Card>
  );
}

export function DeviceBanner({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  return model.sleepy ? null : <OfflineBanner device={device} />;
}
