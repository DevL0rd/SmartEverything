import type { ReactNode } from 'react';
import { withRole, type CapabilityRole, type PresentedCapability } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { ControlBlock } from '../controls/control-block';
import { deviceModelOf } from '../model/device-model';
import type { Device } from '../../../store/state';
import type { Television } from './use-television';

const ROLES: readonly CapabilityRole[] = ['picture_mode', 'sound_mode', 'light_sync_mode'];

export function adjustableModes(device: Device): readonly PresentedCapability[] {
  const { presentation } = deviceModelOf(device);
  return ROLES.flatMap((role) => {
    const presented = withRole(presentation, role);
    return presented !== undefined &&
      presented.capability.access !== 'read' &&
      presented.capability.value.kind === 'enum'
      ? [presented]
      : [];
  });
}

export function PictureSound({ tv }: { readonly tv: Television }): ReactNode {
  const modes = adjustableModes(tv.device);
  if (modes.length === 0) {
    return null;
  }
  const reason = tv.view.mode === 'on' ? null : 'Turn the TV on to change this';
  return (
    <Card title="Picture and sound">
      {modes.map((presented) => (
        <ControlBlock
          key={presented.key}
          device={tv.device}
          presented={presented}
          reason={reason}
        />
      ))}
    </Card>
  );
}
