import type { ReactNode } from 'react';
import { useMemo } from 'react';
import type { JsonValue, OptionSourceId, PortValue } from '@smarteverything/domain';
import { useDevices, useRows } from '../../../../../store/selectors';
import {
  controlChoices,
  controlRows,
  controlScopeOf,
  reachOfPorts,
  type ControlChoices,
  type ControlHome,
} from './control-model';
import { OptionPicker } from './option-picker';
import { heldOf } from './option-picker-model';

function useControlHome(): ControlHome {
  const devices = useDevices({ includeHidden: true });
  const groups = useRows('device_groups');
  return useMemo(() => ({ devices, groups }), [devices, groups]);
}

const NOT_A_CONTROL_SOURCE = 'This field does not list device controls';

export function useControlChoices(
  source: OptionSourceId,
  ports: Readonly<Record<string, PortValue>>,
): ControlChoices {
  const home = useControlHome();
  const scope = controlScopeOf(source);
  const reach = useMemo(() => reachOfPorts(ports), [ports]);
  return useMemo(
    (): ControlChoices =>
      scope === null
        ? { status: 'unavailable', reason: NOT_A_CONTROL_SOURCE }
        : controlChoices(home, reach, scope),
    [home, reach, scope],
  );
}

export interface ControlPickerProps {
  readonly source: OptionSourceId;
  readonly ports: Readonly<Record<string, PortValue>>;
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly multiple: boolean;
  readonly disabled: boolean;
  readonly showLabel?: boolean;
  readonly onChange: (value: JsonValue) => void;
}

export function ControlPicker({
  source,
  ports,
  label,
  value,
  multiple,
  disabled,
  showLabel = true,
  onChange,
}: ControlPickerProps): ReactNode {
  const choices = useControlChoices(source, ports);
  const held = heldOf(value);
  const ready = choices.status === 'ready';
  const options = controlRows(ready ? choices.specs : [], ready ? choices.devices : 0, held);
  const reason = ready ? null : choices.reason;
  const common = {
    label,
    options,
    disabled: disabled || (reason !== null && held.length === 0),
    reason,
    placeholder: multiple ? 'Pick controls' : 'Pick a control',
    showLabel,
  };
  if (multiple) {
    return (
      <OptionPicker
        {...common}
        multiple
        held={held}
        onChange={(ids) => {
          onChange([...ids]);
        }}
      />
    );
  }
  return <OptionPicker {...common} multiple={false} value={held[0] ?? null} onPick={onChange} />;
}
