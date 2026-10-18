import type { ReactNode } from 'react';
import type { CapabilityRole } from '@smarteverything/domain';
import { ReasonLine } from '../../../components/reason-line';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { CompactControl } from '../card/compact-control';
import { WIDE_MAX_ACTIONS, type WideClass } from '../card/wide-card';
import { PowerToggle } from '../controls/power-toggle';
import { poweredOffReason } from '../controls/guard';
import { usePrimaryControls } from '../controls/primary-controls';
import { cardControls } from '../model/card-facts';
import { powerStateOf, useDeviceModel } from '../model/device-model';
import { isOffline, OFFLINE_REASON } from '../model/offline';
import { ModeMenuButton } from './mode-menu';

const WITHOUT_POWER: ReadonlySet<CapabilityRole> = new Set(['power']);
const CONTROL_WIDTH = 168;

function useCardActions(device: Device, cls: WideClass): readonly ReactNode[] {
  const model = useDeviceModel(device);
  const primary = usePrimaryControls(device, WITHOUT_POWER);
  const off = useDeviceDerived(device.id, (values) => powerStateOf(model, values) === 'off', [
    model,
  ]);
  if (isOffline(device)) {
    return [<ReasonLine key="why" icon="wifi" text={OFFLINE_REASON} />];
  }
  const reason = off ? poweredOffReason(device.label) : null;
  const controls = cardControls(model.family, primary, WIDE_MAX_ACTIONS[cls] - 1);
  return [
    <PowerToggle key="power" device={device} />,
    ...controls.map((presented) =>
      presented.capability.value.kind === 'enum' ? (
        <ModeMenuButton key={presented.key} device={device} presented={presented} reason={reason} />
      ) : (
        <CompactControl
          key={presented.key}
          device={device}
          presented={presented}
          reason={reason}
          width={CONTROL_WIDTH}
          labels="inline"
        />
      ),
    ),
  ];
}

export function CardActions({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: WideClass;
}): ReactNode {
  return useCardActions(device, cls);
}
