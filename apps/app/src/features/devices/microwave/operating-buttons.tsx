import type { ReactNode } from 'react';
import { View } from 'react-native';
import { MICROWAVE_KEYS, type MicrowaveMode } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { useControl } from '../../../store/control';
import { useDeviceValues } from '../../../store/selectors';
import type { Device, DeviceValues } from '../../../store/state';

function OperationButton({
  device,
  capability,
  label,
  disabled,
}: {
  readonly device: Device;
  readonly capability: string;
  readonly label: string;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, capability);
  const supported = device.capabilities.some((entry) => entry.key === capability);
  return supported ? (
    <Button
      label={label}
      variant="tonal"
      disabled={disabled}
      loading={control.pending}
      onPress={() => {
        if (disabled || control.pending) {
          return;
        }
        void control.set(null);
      }}
    />
  ) : null;
}
function operations(
  values: DeviceValues,
  disabled: boolean,
): readonly { readonly capability: string; readonly label: string; readonly disabled: boolean }[] {
  const state = values[MICROWAVE_KEYS.state]?.value;
  const result = [];
  if (state === 'ready' || state === 'paused') {
    result.push({
      capability: MICROWAVE_KEYS.start,
      label: state === 'paused' ? 'Resume cooking' : 'Start cooking',
      disabled,
    });
  }
  if (state === 'running') {
    result.push({ capability: MICROWAVE_KEYS.pause, label: 'Pause', disabled: false });
  }
  if (state === 'running' || state === 'paused') {
    result.push({ capability: MICROWAVE_KEYS.stop, label: 'Stop', disabled: false });
  }
  return result;
}
export function OperatingButtons({
  device,
  mode,
  reason,
}: {
  readonly device: Device;
  readonly mode: MicrowaveMode | undefined;
  readonly reason: string | null;
}): ReactNode {
  const values = useDeviceValues(device.id);
  const mayStart = mode?.supportedOperations.includes('start') === true;
  const unavailable = !device.online || values[MICROWAVE_KEYS.remote]?.value !== 'true';
  const buttons = operations(values, reason !== null || !mayStart);
  return (
    <View className="gap-3">
      <ModeStartNotice mode={mode} />
      <View className="flex-row flex-wrap gap-2">
        {buttons.map((button) => (
          <OperationButton
            key={button.capability}
            device={device}
            {...button}
            disabled={button.disabled || unavailable}
          />
        ))}
      </View>
    </View>
  );
}

function ModeStartNotice({ mode }: { readonly mode: MicrowaveMode | undefined }): ReactNode {
  if (mode === undefined || mode.supportedOperations.includes('start')) {
    return null;
  }
  return (
    <Text variant="footnote" tone="variant">
      This mode starts on the microwave.
    </Text>
  );
}
