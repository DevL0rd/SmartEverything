import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Slider } from '../../../components/slider';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useControl, type Control } from '../../../store/control';
import type { Device } from '../../../store/state';
import { shownValue } from '../model/device-model';
import { CapabilityRow } from './capability-row';
import { ColourBlock } from './colour-block';
import { DialBlock, isDial } from './dial-block';
import { Guard } from './guard';
import { SEGMENTED_MOST_OPTIONS, usesStepper, type NumberDescriptor } from './number-kind';
import { useAction } from './use-action';

interface BlockProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly control: Control;
  readonly disabled: boolean;
}

function Labelled({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="callout" tone="variant">
          {label}
        </Text>
        {value === undefined ? null : (
          <Text variant="callout" tone="variant" className="tabular">
            {value}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function EnumBlock({ presented, control, disabled }: BlockProps): ReactNode {
  const value = typeof control.value === 'string' ? control.value : '';
  const set = (next: string): void => {
    void control.set(next);
  };
  return (
    <Labelled label={presented.label}>
      {presented.options.length <= SEGMENTED_MOST_OPTIONS ? (
        <Segmented
          label={presented.label}
          options={presented.options}
          value={value}
          disabled={disabled}
          onChange={set}
        />
      ) : (
        <Select
          label={presented.label}
          options={presented.options}
          value={value === '' ? null : value}
          disabled={disabled}
          onChange={set}
        />
      )}
    </Labelled>
  );
}

function NumberBlock(props: BlockProps & { readonly descriptor: NumberDescriptor }): ReactNode {
  const { presented, control, disabled, descriptor } = props;
  if (isDial(presented)) {
    return <DialBlock {...props} />;
  }
  const value = typeof control.value === 'number' ? control.value : descriptor.min;
  const format = (next: number): string => shownValue(presented, next);
  const set = (next: number): void => {
    void control.set(next);
  };
  if (usesStepper(descriptor, presented)) {
    return (
      <Labelled label={presented.label}>
        <NumberStepper
          value={value}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.step}
          label={presented.label}
          disabled={disabled}
          formatValue={format}
          onChange={set}
        />
      </Labelled>
    );
  }
  return (
    <Labelled label={presented.label} value={shownValue(presented, control.value)}>
      <Slider
        label={presented.label}
        value={value}
        min={descriptor.min}
        max={descriptor.max}
        step={descriptor.step}
        disabled={disabled}
        formatValue={format}
        onCommit={set}
      />
    </Labelled>
  );
}

function SwitchBlock({ presented, control, disabled }: BlockProps): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Text variant="body">{presented.label}</Text>
      <Switch
        label={presented.label}
        value={control.value === true}
        disabled={disabled}
        onChange={(next: JsonValue) => {
          void control.set(next);
        }}
      />
    </View>
  );
}

function ActionBlock({ device, presented, disabled }: BlockProps): ReactNode {
  const action = useAction(device, presented);
  return (
    <>
      <Button
        label={presented.label}
        variant={presented.danger.tier === 'none' ? 'tonal' : 'destructive'}
        loading={action.pending}
        disabled={disabled}
        onPress={action.run}
      />
      {action.sheet}
    </>
  );
}

function Block(props: BlockProps): ReactNode {
  const descriptor = props.presented.capability.value;
  switch (descriptor.kind) {
    case 'boolean':
      return <SwitchBlock {...props} />;
    case 'enum':
      return <EnumBlock {...props} />;
    case 'number':
      return <NumberBlock {...props} descriptor={descriptor} />;
    case 'color':
      return <ColourBlock deviceId={props.device.id} presented={props.presented} />;
    case 'action':
      return <ActionBlock {...props} />;
    case 'text':
      return <CapabilityRow device={props.device} presented={props.presented} reason={null} />;
  }
}

export function ControlBlock({
  device,
  presented,
  reason,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
}): ReactNode {
  const control = useControl(device.id, presented.key);
  return (
    <Guard reason={reason}>
      <Block device={device} presented={presented} control={control} disabled={reason !== null} />
    </Guard>
  );
}
