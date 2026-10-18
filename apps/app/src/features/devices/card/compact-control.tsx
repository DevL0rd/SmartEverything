import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue, PresentedCapability } from '@smarteverything/domain';
import { NumberStepper } from '../../../components/number-stepper';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Slider } from '../../../components/slider';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import type { Control } from '../../../store/control';
import type { Device } from '../../../store/state';
import { Guard } from '../controls/guard';
import { ActionButton } from '../controls/action-button';
import {
  SEGMENTED_MOST_OPTIONS,
  INLINE_LABEL_SHARE,
  isSliderControl,
  labelModeOf,
  type LabelMode,
  type NumberDescriptor,
} from '../controls/number-kind';
import { liveChange, useDeviceControl } from '../controls/use-device-control';
import { shownValue } from '../model/device-model';
import { background } from '@smarteverything/logging';

const LETTER_PX = { touch: 8, pointer: 7 } as const;
const SEGMENT_CHROME_PX = { touch: 36, pointer: 26 } as const;

function segmentsFit(
  options: readonly { readonly label: string }[],
  width: number,
  idiom: 'touch' | 'pointer',
): boolean {
  const needed = options.reduce(
    (sum, option) => sum + option.label.length * LETTER_PX[idiom] + SEGMENT_CHROME_PX[idiom],
    0,
  );
  return options.length <= SEGMENTED_MOST_OPTIONS && needed <= width;
}

interface Props {
  readonly presented: PresentedCapability;
  readonly device: Device;
  readonly control: Control;
  readonly disabled: boolean;
  readonly width: number;
  readonly labels: LabelMode;
}

export type { LabelMode };

function Labelled({
  presented,
  labels,
  children,
}: {
  readonly presented: PresentedCapability;
  readonly labels: LabelMode;
  readonly children: ReactNode;
}): ReactNode {
  if (labels === 'caption') {
    return children;
  }
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <Text variant="callout" tone="variant" numberOfLines={1} className="w-2/5 shrink">
        {presented.label}
      </Text>
      <View className="min-w-0 flex-1 items-end">{children}</View>
    </View>
  );
}

function Caption({
  presented,
  value,
  shown,
}: {
  readonly presented: PresentedCapability;
  readonly value: string | null;
  readonly shown: boolean;
}): ReactNode {
  if (!shown) {
    return null;
  }
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {presented.label}
      </Text>
      {value === null ? null : (
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  );
}

function EnumControl({ presented, control, disabled, width, labels }: Props): ReactNode {
  const value = typeof control.value === 'string' ? control.value : null;
  const set = (next: string): void => {
    background(control.set(next), 'control.set_failed');
  };
  const idiom = useIdiom();
  const room = labels === 'inline' ? width * (1 - INLINE_LABEL_SHARE) : width;
  const segmented = value !== null && segmentsFit(presented.options, room, idiom);
  return (
    <View className="gap-1.5">
      <Caption presented={presented} value={null} shown={labels === 'caption'} />
      {segmented ? (
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
          showLabel={false}
          placeholder="—"
          options={presented.options}
          value={value}
          disabled={disabled}
          onChange={set}
        />
      )}
    </View>
  );
}

function NumberCaption({
  presented,
  control,
  labels,
  stepper,
}: Pick<Props, 'presented' | 'control' | 'labels'> & { readonly stepper: boolean }): ReactNode {
  if (!stepper && labels === 'inline' && typeof control.value !== 'number')
    return (
      <Text variant="footnote" tone="variant">
        {shownValue(presented, control.value)}
      </Text>
    );
  return (
    <Caption
      presented={presented}
      value={stepper ? null : shownValue(presented, control.value)}
      shown={labels === 'caption'}
    />
  );
}

function TrailingValue({
  text,
  children,
}: {
  readonly text: string | null;
  readonly children: ReactNode;
}): ReactNode {
  if (text === null) {
    return children;
  }
  return (
    <View className="w-full flex-row items-center gap-3">
      <View className="min-w-0 flex-1">{children}</View>
      <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function NumberControl(props: Props & { readonly descriptor: NumberDescriptor }): ReactNode {
  const { presented, control, disabled, labels, descriptor } = props;
  const value = typeof control.value === 'number' ? control.value : null;
  const format = (next: number): string => shownValue(presented, next);
  const set = (next: number): void => {
    background(control.set(next), 'control.set_failed');
  };
  const stepper = !isSliderControl(presented);
  return (
    <View className="w-full gap-1.5">
      <NumberCaption presented={presented} control={control} labels={labels} stepper={stepper} />
      {stepper ? (
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
      ) : (
        <TrailingValue text={labels === 'inline' && value !== null ? format(value) : null}>
          <Slider
            value={value}
            min={descriptor.min}
            max={descriptor.max}
            step={descriptor.step}
            label={presented.label}
            disabled={disabled}
            formatValue={format}
            unknownValue={shownValue(presented, control.value)}
            {...liveChange(presented, set)}
            onCommit={set}
          />
        </TrailingValue>
      )}
    </View>
  );
}

function SwitchControl({ presented, control, disabled }: Props): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center justify-between gap-3">
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {presented.label}
      </Text>
      <Switch
        label={presented.label}
        value={control.value === true}
        disabled={disabled}
        onChange={(next: JsonValue) => {
          background(control.set(next), 'control.set_failed');
        }}
      />
    </View>
  );
}

function Body(props: Props): ReactNode {
  const descriptor = props.presented.capability.value;
  switch (descriptor.kind) {
    case 'enum':
      return <EnumControl {...props} />;
    case 'number':
      return <NumberControl {...props} descriptor={descriptor} />;
    case 'boolean':
      return <SwitchControl {...props} />;
    case 'action':
      return (
        <ActionButton device={props.device} presented={props.presented} disabled={props.disabled} />
      );
    case 'color':
    case 'text':
      return null;
  }
}

export function CompactControl({
  device,
  presented,
  reason,
  width,
  labels: requested,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
  readonly reason: string | null;
  readonly width: number;
  readonly labels: LabelMode;
}): ReactNode {
  const control = useDeviceControl(device, presented);
  const kind = presented.capability.value.kind;
  const labels = labelModeOf(presented, requested, width);
  const inline = labels === 'inline' && kind !== 'boolean' && kind !== 'action';
  return (
    <Guard reason={reason}>
      <Labelled presented={presented} labels={inline ? 'inline' : 'caption'}>
        <Body
          device={device}
          presented={presented}
          control={control}
          disabled={reason !== null}
          width={width}
          labels={labels}
        />
      </Labelled>
    </Guard>
  );
}
