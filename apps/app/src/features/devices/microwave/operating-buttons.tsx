import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { MICROWAVE_KEYS, microwaveReadiness, type JsonValue } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import type { IconName } from '../../../components/icon';
import { useControl } from '../../../store/control';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { microwaveValues } from './model';

interface Operation {
  readonly capability: string;
  readonly label: string;
  readonly icon: IconName;
  readonly look: 'filled' | 'tonal' | 'text';
  readonly disabled: boolean;
  readonly ask: boolean;
}

const STOP_QUESTION = {
  title: 'Stop cooking?',
  body: 'The food stays inside. You can start again from here.',
  confirmLabel: 'Stop',
  tone: 'destructive',
} as const;

function OperationButton({
  device,
  operation,
}: {
  readonly device: Device;
  readonly operation: Operation;
}): ReactNode {
  const control = useControl(device.id, operation.capability);
  const supported = device.capabilities.some((entry) => entry.key === operation.capability);
  return supported ? (
    <Button
      label={operation.label}
      icon={operation.icon}
      variant={operation.look}
      disabled={operation.disabled}
      loading={control.pending}
      onPress={() => {
        if (operation.disabled || control.pending) {
          return;
        }
        background(
          (operation.ask ? confirm(STOP_QUESTION) : Promise.resolve(true)).then((accepted) =>
            accepted ? control.set(null) : undefined,
          ),
          'control.set_failed',
        );
      }}
    />
  ) : null;
}

function operations(state: JsonValue | undefined, resumeBlocked: boolean): readonly Operation[] {
  const running = state === 'running';
  const paused = state === 'paused';
  return [
    ...(paused
      ? [
          {
            capability: MICROWAVE_KEYS.start,
            label: 'Resume',
            icon: 'play',
            look: 'filled',
            disabled: resumeBlocked,
            ask: false,
          } as const,
        ]
      : []),
    ...(running
      ? [
          {
            capability: MICROWAVE_KEYS.pause,
            label: 'Pause',
            icon: 'pause',
            look: 'tonal',
            disabled: false,
            ask: false,
          } as const,
        ]
      : []),
    ...(running || paused
      ? [
          {
            capability: MICROWAVE_KEYS.stop,
            label: 'Stop',
            icon: 'square',
            look: 'text',
            disabled: false,
            ask: true,
          } as const,
        ]
      : []),
  ];
}

interface Gate {
  readonly state: JsonValue | undefined;
  readonly blocked: boolean;
  readonly remote: boolean;
}

export function OperatingButtons({
  device,
  primaryOnly = false,
}: {
  readonly device: Device;
  readonly primaryOnly?: boolean;
}): ReactNode {
  const gate = useDeviceDerived(
    device.id,
    (values): Gate => ({
      state: values[MICROWAVE_KEYS.state]?.value,
      blocked: microwaveReadiness(microwaveValues(values)) !== null,
      remote: values[MICROWAVE_KEYS.remote]?.value === 'true',
    }),
    [],
  );
  const unavailable = !device.online || !gate.remote;
  const listed = operations(gate.state, gate.blocked);
  return (
    <View className="flex-row flex-wrap items-center gap-2" pointerEvents="box-none">
      {(primaryOnly ? listed.slice(0, 1) : listed).map((operation) => (
        <OperationButton
          key={operation.capability}
          device={device}
          operation={{ ...operation, disabled: operation.disabled || unavailable }}
        />
      ))}
    </View>
  );
}
