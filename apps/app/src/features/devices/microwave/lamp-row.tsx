import type { ReactNode } from 'react';
import { z } from 'zod';
import { humanizeEnum, type PresentedCapability } from '@smarteverything/domain';
import { SelectRow, ValueRow } from '../../../components/rows';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device } from '../../../store/state';
export function MicrowaveLampRow({
  device,
  presented,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
}): ReactNode {
  const control = useControl(device.id, presented.key);
  const values = useDeviceValues(device.id);
  const supported = z
    .array(z.string())
    .safeParse(values['raw:samsungce.lamp.supported_brightness_level']?.value);
  if (!supported.success || supported.data.length === 0) {
    return <ValueRow title={presented.label} value="Supported light settings not reported" />;
  }
  return (
    <SelectRow
      title={presented.label}
      value={typeof control.value === 'string' ? control.value : null}
      options={supported.data.map((value) => ({ value, label: humanizeEnum(value) }))}
      disabled={!device.online || control.pending}
      onChange={(value) => {
        void control.set(value);
      }}
    />
  );
}
