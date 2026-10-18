import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useRoleControl, type ControlRole } from './use-role-control';
import type { Laundry } from './use-laundry';
import { background } from '@smarteverything/logging';

export interface PillOption {
  readonly value: string;
  readonly label: string;
  readonly spoken?: string;
}

export function FieldLabel({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="label" tone="variant" className="uppercase" accessibilityRole="header">
      {text}
    </Text>
  );
}

function Pill({
  option,
  selected,
  disabled = false,
  fill,
  onPress,
}: {
  readonly option: PillOption;
  readonly selected: boolean;
  readonly disabled?: boolean;
  readonly fill: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      checked={selected}
      disabled={disabled}
      label={option.spoken ?? option.label}
      onPress={onPress}
      className={cn(
        'min-h-touch-min min-w-14 items-center justify-center rounded-full border px-3.5',
        fill && 'grow',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-2',
      )}
      layerClassName="rounded-full"
    >
      <Text variant="body-strong" tone={selected ? 'primary' : 'default'} className="tabular">
        {option.label}
      </Text>
    </Interactive>
  );
}

export function Pills({
  label,
  options,
  value,
  disabled = false,
  fill = false,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly PillOption[];
  readonly value: string | null;
  readonly disabled?: boolean;
  readonly fill?: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <View className="gap-1.5">
      <FieldLabel text={label} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-2"
      >
        {options.map((option) => (
          <Pill
            key={option.value}
            option={option}
            selected={option.value === value}
            disabled={disabled}
            fill={fill}
            onPress={() => {
              onChange(option.value);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function SwitchRow({
  title,
  sub,
  value,
  disabled = false,
  onChange,
}: {
  readonly title: string;
  readonly sub?: string;
  readonly value: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: boolean) => void;
}): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <View className="min-w-0 flex-1">
        <Text variant="body">{title}</Text>
        {sub === undefined ? null : (
          <Text variant="footnote" tone="variant">
            {sub}
          </Text>
        )}
      </View>
      <Switch label={title} value={value} disabled={disabled} onChange={onChange} />
    </View>
  );
}

export function RoleSwitch({
  laundry,
  source,
  title,
  sub,
}: {
  readonly laundry: Laundry;
  readonly source: ControlRole;
  readonly title: string;
  readonly sub?: string;
}): ReactNode {
  const { key, control } = useRoleControl(laundry, source);
  if (key === undefined) {
    return null;
  }
  return (
    <SwitchRow
      title={title}
      {...(sub === undefined ? {} : { sub })}
      value={control.value === true}
      disabled={!laundry.device.online || control.pending}
      onChange={(next) => {
        background(control.set(next), 'laundry.switch_failed');
      }}
    />
  );
}

export function Note({
  icon = 'info',
  tone = 'variant',
  text,
}: {
  readonly icon?: IconName;
  readonly tone?: Tone;
  readonly text: string;
}): ReactNode {
  return (
    <View className="flex-row items-start gap-1.5">
      <Icon name={icon} size={16} tone={tone} />
      <Text variant="footnote" tone={tone} className="min-w-0 flex-1">
        {text}
      </Text>
    </View>
  );
}

export function RoleChoice({
  laundry,
  source,
  label,
  options,
}: {
  readonly laundry: Laundry;
  readonly source: ControlRole;
  readonly label: string;
  readonly options: readonly PillOption[];
}): ReactNode {
  const { key, control } = useRoleControl(laundry, source);
  if (key === undefined) {
    return null;
  }
  return (
    <Pills
      label={label}
      options={options}
      value={typeof control.value === 'string' ? control.value : null}
      disabled={!laundry.device.online || control.pending}
      fill
      onChange={(next) => {
        background(control.set(next), 'laundry.choice_failed');
      }}
    />
  );
}
