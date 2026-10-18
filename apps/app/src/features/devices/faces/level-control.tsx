import type { ReactNode } from 'react';
import {
  isLiveControl,
  levelPercent,
  levelRangeOf,
  levelValue,
  type PresentedCapability,
} from '@smarteverything/domain';
import { LevelSurface, type LevelShape } from '../../../components/level-surface';
import type { ThumbPolicy } from '../../../components/level-math';
import { useControl } from '../../../store/control';
import { useLiveControl } from '../../../store/use-live-control';
import type { Device } from '../../../store/state';
import { usePowerAction } from '../controls/power-toggle';
import { background } from '@smarteverything/logging';

const OFFLINE_TEXT = 'Offline';

export interface LevelControlProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly label: string;
  readonly shape?: LevelShape;
  readonly thumb?: ThumbPolicy | undefined;
  readonly tint?: string | undefined;
  readonly showValue?: boolean;
  readonly adjustable?: boolean;
  readonly trailing?: ReactNode;
  readonly className?: string;
  readonly children?: ReactNode;
}

export function LevelControl({
  device,
  presented,
  label,
  ...surface
}: LevelControlProps): ReactNode {
  const raw = useControl(device.id, presented.key);
  const live = isLiveControl(presented);
  const control = useLiveControl(device, presented.key, raw, live);
  const power = usePowerAction(device);
  const range = levelRangeOf(presented);
  const percent =
    range === null || typeof control.value !== 'number' ? null : levelPercent(range, control.value);
  const off = power.state === 'off';
  const switchable = power.state === 'on' || power.state === 'off';
  return (
    <LevelSurface
      {...surface}
      label={label}
      value={off ? null : percent}
      restingValue={percent}
      disabled={!device.online}
      valueText={device.online ? undefined : OFFLINE_TEXT}
      onToggle={switchable ? power.toggle : undefined}
      onChange={(next, phase) => {
        if (phase === 'live' && !live) {
          return;
        }
        if (live && off) {
          power.set(true);
        }
        background(
          control.set(range === null ? next : levelValue(range, next)),
          'control.set_failed',
        );
      }}
    />
  );
}
