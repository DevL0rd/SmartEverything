import { deviceCardOf } from '../../../plugins/device-contributions';
import type { ReactNode } from 'react';
import type { CapabilityRole } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import type { Device } from '../../../store/state';
import { PrimaryControls, usePrimaryControls } from '../controls/primary-controls';
import { useDeviceModel } from '../model/device-model';
import { ButtonHero } from '../button/button-page';
import { DiffuserHero } from '../diffuser/diffuser-page';
import { MicrowaveHero } from '../microwave/hero';
import { RemoteHero } from '../remote/remote-hero';
import { WatchHero } from '../../watches';
import { DeviceHero } from './device-hero';
import { ScaleHero } from './scale-hero';
import { FAMILY_PRIMARY_CARDS } from './primary-card-families';
import { stagedRoles } from './stage-level';
import { OfflineBanner } from './offline-banner';

export function Hero({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const card = deviceCardOf(device);
  if (card?.hero !== undefined) return card.hero(device);
  if (model.family === 'scale') {
    return <ScaleHero device={device} />;
  }
  if (model.family === 'button') {
    return <ButtonHero device={device} />;
  }
  if (model.family === 'diffuser') {
    return <DiffuserHero device={device} />;
  }
  if (model.family === 'microwave') {
    return <MicrowaveHero device={device} />;
  }
  if (model.family === 'ir_remote') {
    return <RemoteHero device={device} />;
  }
  if (model.family === 'wearable') {
    return <WatchHero device={device} />;
  }
  return <DeviceHero device={device} />;
}

function CardControls({
  device,
  staged,
}: {
  readonly device: Device;
  readonly staged: ReadonlySet<CapabilityRole>;
}): ReactNode {
  const Custom = FAMILY_PRIMARY_CARDS[useDeviceModel(device).family]?.controls;
  return Custom === undefined ? (
    <PrimaryControls device={device} exclude={staged} />
  ) : (
    <Custom device={device} />
  );
}

export function PrimaryCard({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const staged = stagedRoles(model);
  const controls = usePrimaryControls(device, staged);
  const custom = FAMILY_PRIMARY_CARDS[model.family];
  const empty = custom === undefined ? controls.length === 0 : !custom.present(model);
  if (empty) {
    return null;
  }
  return (
    <Card>
      {device.online || model.sleepy ? (
        <CardControls device={device} staged={staged} />
      ) : (
        <EmptyState
          compact
          icon="plug"
          title="Not responding"
          body="Check that it’s plugged in and on Wi‑Fi."
        />
      )}
    </Card>
  );
}

export function DeviceBanner({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const notice = deviceCardOf(device)?.notice;
  if (notice !== undefined) {
    return notice(device);
  }
  return model.sleepy ? null : <OfflineBanner device={device} />;
}
