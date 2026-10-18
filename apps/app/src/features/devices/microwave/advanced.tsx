import type { ReactNode } from 'react';
import { useState } from 'react';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import { MICROWAVE_FORM_SPECS } from './form-specs';
import { MicrowaveStructuredRow } from './structured-row';

const MICROWAVE_ADVANCED_KEYS: ReadonlySet<string> = new Set(
  Object.entries(MICROWAVE_FORM_SPECS)
    .filter(([, spec]) => spec.cooking)
    .map(([key]) => key),
);
export function MicrowaveAdvanced({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  const actions = useDeviceModel(device).presentation.capabilities.filter(
    (presented) => MICROWAVE_ADVANCED_KEYS.has(presented.key) && presented.writable,
  );
  if (actions.length === 0) {
    return null;
  }
  return (
    <List>
      <ListRow
        title="Advanced"
        subtitle="Samsung recipe actions"
        icon={open ? 'chevronUp' : 'chevronDown'}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open
        ? actions.map((presented) => (
            <MicrowaveStructuredRow key={presented.key} device={device} presented={presented} />
          ))
        : []}
    </List>
  );
}
