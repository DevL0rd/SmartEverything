import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { deviceFamily, type JsonValue, type PresentedCapability } from '@smarteverything/domain';
import { Highlighted, type TextRange } from '../../../components/highlighted';
import { ListRow } from '../../../components/list-row';
import { cn } from '../../../design/cn';
import { NumberStepper } from '../../../components/number-stepper';
import { SelectRow, SwitchRow, ValueRow } from '../../../components/rows';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useControl, type Control } from '../../../store/control';
import type { Device } from '../../../store/state';
import { shownValue } from '../model/device-model';
import { FAMILY_CONTROLS } from './family-controls';
import { ColourBlock } from './colour-block';
import { TimeRow } from './time-row';
import { Guard } from './guard';
import { usesStepper, type NumberDescriptor } from './number-kind';
import { useAction } from './use-action';

interface RowProps {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly control: Control;
  readonly disabled: boolean;
  readonly highlight: TextRange | null;
}

function NumberHeading({
  presented,
  highlight,
  disabled,
  trailing,
}: Pick<RowProps, 'presented' | 'highlight' | 'disabled'> & {
  readonly trailing: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="body" className={cn('shrink', disabled && 'opacity-40')}>
        <Highlighted text={presented.label} range={highlight} />
      </Text>
      {trailing}
    </View>
  );
}

function NumberRow(props: RowProps & { readonly descriptor: NumberDescriptor }): ReactNode {
  const { presented, control, disabled, descriptor } = props;
  const value = typeof control.value === 'number' ? control.value : descriptor.min;
  const format = (next: number): string => shownValue(presented, next);
  const set = (next: number): void => {
    void control.set(next);
  };
  const bounds = { min: descriptor.min, max: descriptor.max, step: descriptor.step };
  if (usesStepper(descriptor, presented)) {
    const stepper = (
      <NumberStepper
        value={value}
        {...bounds}
        label={presented.label}
        disabled={disabled}
        formatValue={format}
        onChange={set}
      />
    );
    return (
      <View className="min-h-row-h justify-center px-4 py-2">
        <NumberHeading {...props} trailing={stepper} />
      </View>
    );
  }
  const reading = (
    <Text variant="body" tone="variant" className={cn(disabled && 'opacity-40')}>
      {shownValue(presented, control.value)}
    </Text>
  );
  return (
    <View className="gap-2 px-4 py-3">
      <NumberHeading {...props} trailing={reading} />
      <Slider
        label={presented.label}
        value={value}
        {...bounds}
        disabled={disabled}
        formatValue={format}
        onCommit={set}
      />
    </View>
  );
}

function TextRow({ presented, control, disabled, highlight }: RowProps): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const current = typeof control.value === 'string' ? control.value : '';
  const descriptor = presented.capability.value;
  return (
    <>
      <ListRow
        title={presented.label}
        titleHighlight={highlight}
        value={current === '' ? 'Not set' : current}
        chevron
        disabled={disabled}
        onPress={() => {
          setRequest({
            title: presented.label,
            label: presented.label,
            initial: current,
            placeholder: presented.label,
            confirmLabel: 'Save',
            maxLength: descriptor.kind === 'text' ? descriptor.maxLength : 4096,
            save: async (value) => {
              await control.set(value);
            },
          });
        }}
      />
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </>
  );
}

function ActionRowFor({ device, presented, disabled, highlight }: RowProps): ReactNode {
  const action = useAction(device, presented);
  return (
    <>
      <ListRow
        title={action.pending ? `${presented.label}…` : presented.label}
        titleHighlight={action.pending ? null : highlight}
        icon={presented.danger.tier === 'none' ? 'play' : 'warning'}
        destructive={presented.danger.tier !== 'none'}
        disabled={disabled || action.pending}
        onPress={action.run}
      />
      {action.sheet}
    </>
  );
}

function ColourRow({ device, presented, disabled }: RowProps): ReactNode {
  return (
    <View className={cn('px-4 py-3', disabled && 'opacity-40')}>
      <ColourBlock deviceId={device.id} presented={presented} disabled={disabled} />
    </View>
  );
}

function WritableRow(props: RowProps): ReactNode {
  const { presented, control, disabled } = props;
  const descriptor = presented.capability.value;
  const set = (value: JsonValue): void => {
    void control.set(value);
  };
  const heading = { title: presented.label, titleHighlight: props.highlight };
  switch (descriptor.kind) {
    case 'boolean':
      return (
        <SwitchRow {...heading} value={control.value === true} disabled={disabled} onChange={set} />
      );
    case 'enum':
      return (
        <SelectRow
          {...heading}
          options={presented.options}
          value={typeof control.value === 'string' ? control.value : null}
          disabled={disabled}
          onChange={set}
          {...(presented.capability.access === 'write' ? { placeholder: 'Choose' } : {})}
        />
      );
    case 'number':
      return <NumberRow {...props} descriptor={descriptor} />;
    case 'color':
      return <ColourRow {...props} />;
    case 'text':
      return presented.clock === null ? (
        <TextRow {...props} />
      ) : (
        <TimeRow
          presented={presented}
          clock={presented.clock}
          control={control}
          disabled={disabled}
        />
      );
    case 'action':
      return <ActionRowFor {...props} />;
  }
}

function CapabilityBody(props: RowProps): ReactNode {
  return props.presented.colorEncoding === undefined ? (
    <WritableRow {...props} />
  ) : (
    <ColourRow {...props} />
  );
}

export function CapabilityRow({
  device,
  presented,
  reason,
  highlight = null,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
  readonly highlight?: TextRange | null;
}): ReactNode {
  const control = useControl(device.id, presented.key);
  const Custom = FAMILY_CONTROLS[deviceFamily(device)]?.rows[presented.key];
  if (Custom !== undefined && presented.writable) {
    return <Custom device={device} presented={presented} />;
  }
  if (!presented.writable) {
    return (
      <ValueRow
        title={presented.label}
        titleHighlight={highlight}
        value={shownValue(presented, control.value)}
      />
    );
  }
  return (
    <Guard reason={reason}>
      <CapabilityBody
        device={device}
        presented={presented}
        control={control}
        disabled={reason !== null}
        highlight={highlight}
      />
    </Guard>
  );
}
