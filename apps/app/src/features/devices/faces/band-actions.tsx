import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { isActionControl, useControlCandidates } from '../card/card-controls';
import { ActionButton } from '../controls/action-button';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { Guard, poweredOffReason } from '../controls/guard';
import { PowerToggle } from '../controls/power-toggle';
import { useDeviceModel } from '../model/device-model';

function CardActionButtons({ device }: { readonly device: Device }): ReactNode {
  const { off, all } = useControlCandidates(device);
  const reason = off ? poweredOffReason(device.label) : null;
  return all.filter(isActionControl).map((presented) => (
    <Guard key={presented.key} reason={reason}>
      <ActionButton device={device} presented={presented} disabled={reason !== null} />
    </Guard>
  ));
}

export function BandActions({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const curated = FAMILY_CONTROLS[model.family]?.card !== undefined;
  if (curated || (!device.online && !model.sleepy)) {
    return null;
  }
  return <CardActionButtons device={device} />;
}

export function DeviceBandItems({ device }: { readonly device: Device }): ReactNode {
  return (
    <>
      <BandActions device={device} />
      <PowerToggle device={device} />
    </>
  );
}
