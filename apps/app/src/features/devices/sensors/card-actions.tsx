import type { ReactNode } from 'react';
import type { CapabilityRole, PresentedCapability } from '@smarteverything/domain';
import { ReasonLine } from '../../../components/reason-line';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CompactControl } from '../card/compact-control';
import { PowerToggle } from '../controls/power-toggle';
import { poweredOffReason } from '../controls/guard';
import { usePrimaryControls } from '../controls/primary-controls';
import { cardControls } from '../model/card-facts';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { isOffline, OFFLINE_REASON } from '../model/offline';
import { ModeMenuButton } from './mode-menu';

const WITHOUT_POWER: ReadonlySet<CapabilityRole> = new Set(['power']);
const CONTROL_WIDTH = 168;

function numberAction(
  device: Device,
  presented: PresentedCapability,
  reason: string | null,
): ReactNode {
  return (
    <CompactControl
      key={presented.key}
      device={device}
      presented={presented}
      reason={reason}
      width={CONTROL_WIDTH}
      labels="inline"
    />
  );
}

function useCardActions(device: Device): readonly ReactNode[] {
  const model = useDeviceModel(device);
  const primary = usePrimaryControls(device, WITHOUT_POWER);
  const off = useDeviceDerived(device.id, (values) => powerStateOf(model, values) === 'off', [
    model,
  ]);
  if (isOffline(device)) {
    return [<ReasonLine key="why" icon="wifi" text={OFFLINE_REASON} />];
  }
  const reason = off ? poweredOffReason(device.label) : null;
  const controls = cardControls(model.family, primary, primary.length);
  return [
    <PowerToggle key="power" device={device} />,
    ...controls.map((presented) =>
      presented.capability.value.kind === 'enum' ? (
        <ModeMenuButton key={presented.key} device={device} presented={presented} reason={reason} />
      ) : (
        numberAction(device, presented, reason)
      ),
    ),
  ];
}

export function CardActions({ device }: { readonly device: Device }): ReactNode {
  return useCardActions(device);
}
