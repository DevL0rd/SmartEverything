import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';

export function PanelFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-3 rounded-lg bg-surface-2 p-4">
      <Text variant="label" tone="variant" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

export function PanelTop({
  gauge,
  children,
}: {
  readonly gauge: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-4">
      <View className="shrink-0">{gauge}</View>
      <View className="min-w-0 flex-1 gap-3">{children}</View>
    </View>
  );
}

export interface StepButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly disabled: boolean;
  readonly hint: string;
  readonly onPress: () => void;
  readonly onLongPress?: () => void;
  readonly onPressOut?: () => void;
}

export function StepButton({
  icon,
  label,
  disabled,
  hint,
  onPress,
  onLongPress,
  onPressOut,
}: StepButtonProps): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <Interactive
        role="button"
        label={label}
        hint={hint}
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        className={cn(
          'h-touch-min items-center justify-center rounded-full',
          disabled ? 'bg-on-surface/10' : 'bg-primary-container',
        )}
      >
        <Icon name={icon} size={24} tone={disabled ? 'faint' : 'onPrimaryContainer'} />
      </Interactive>
    </View>
  );
}

export function StepRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-row gap-3">{children}</View>;
}

export interface ChipProps {
  readonly label: string;
  readonly spoken: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly hint: string;
  readonly onPress: () => void;
}

function Chip({ label, spoken, selected, disabled, hint, onPress }: ChipProps): ReactNode {
  return (
    <View className="min-w-14 flex-1">
      <Interactive
        role="button"
        label={spoken}
        hint={hint}
        selected={selected}
        disabled={disabled}
        onPress={onPress}
        className={cn(
          'h-11 items-center justify-center rounded-full border px-3',
          selected ? 'border-transparent bg-primary-container' : 'border-outline',
          disabled && 'border-outline-variant',
        )}
      >
        <Text
          variant="label"
          tone={disabled ? 'faint' : selected ? 'onPrimaryContainer' : 'default'}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Interactive>
    </View>
  );
}

export function ChipRow({ chips }: { readonly chips: readonly ChipProps[] }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {chips.map((chip) => (
        <Chip key={chip.label} {...chip} />
      ))}
    </View>
  );
}

export function ReasonLine({ reason }: { readonly reason: string | null }): ReactNode {
  return reason === null ? null : (
    <Text variant="footnote" tone="variant" accessibilityLiveRegion="polite">
      {reason}
    </Text>
  );
}
