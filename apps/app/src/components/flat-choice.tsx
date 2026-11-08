import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { count as formatCount } from '../format/number';
import { Icon, type IconName } from './icon';
import { Interactive, type InteractiveProps } from './interactive';
import { Text } from './text';

interface FlatChoiceProps extends Pick<
  InteractiveProps,
  'href' | 'onPress' | 'ref' | 'expanded' | 'disabled'
> {
  readonly label: string;
  readonly spoken?: string | undefined;
  readonly icon?: IconName | undefined;
  readonly swatchClassName?: string | undefined;
  readonly trailing?: IconName | undefined;
  readonly count?: number | undefined;
  readonly active: boolean;
  readonly menu?: boolean;
  readonly role?: 'tab' | 'checkbox' | 'button' | 'radio' | undefined;
}

const CHECKED_ROLES = new Set<FlatChoiceProps['role']>(['checkbox', 'radio']);

function choiceName(label: string, quantity: string | undefined): string {
  return quantity === undefined ? label : `${label}, ${quantity}`;
}

function ChoiceIcon({
  name,
  tone,
}: {
  readonly name: IconName | undefined;
  readonly tone: 'primary' | 'variant';
}): ReactNode {
  return name === undefined ? null : (
    <View className="shrink-0">
      <Icon name={name} size={16} tone={tone} />
    </View>
  );
}

function ChoiceLabel({
  label,
  quantity,
  icon,
  swatchClassName,
  trailing,
  active,
}: Pick<FlatChoiceProps, 'label' | 'icon' | 'swatchClassName' | 'trailing' | 'active'> & {
  readonly quantity: string | undefined;
}): ReactNode {
  const tone = active ? 'primary' : 'variant';
  return (
    <>
      {swatchClassName === undefined ? null : (
        <View className={cn('size-2 shrink-0 rounded-full', swatchClassName)} />
      )}
      <ChoiceIcon name={icon} tone={tone} />
      <Text variant="label" tone={tone} className="shrink" numberOfLines={1}>
        {label}
      </Text>
      {quantity === undefined ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {quantity}
        </Text>
      )}
      <ChoiceIcon name={trailing} tone={tone} />
      {active ? (
        <View
          pointerEvents="none"
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-t-full bg-primary"
        />
      ) : null}
    </>
  );
}

export function FlatChoice({
  label,
  spoken,
  icon,
  swatchClassName,
  trailing,
  count,
  active,
  role,
  menu = false,
  ...action
}: FlatChoiceProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const quantity = count === undefined ? undefined : formatCount(count);
  const checkedRole = CHECKED_ROLES.has(role);
  const radius = menu ? 'rounded-sm' : 'rounded-t-xs';
  return (
    <Interactive
      {...action}
      role={role}
      label={spoken ?? choiceName(label, quantity)}
      selected={checkedRole || menu ? undefined : active}
      checked={checkedRole ? active : undefined}
      focusInset
      className={cn(
        'min-w-touch-min max-w-72 flex-row items-center justify-center gap-1.5 px-2',
        radius,
        pointer ? 'min-h-9' : 'min-h-touch-min',
      )}
      layerClassName={radius}
    >
      <ChoiceLabel
        label={label}
        quantity={quantity}
        icon={icon}
        swatchClassName={swatchClassName}
        trailing={trailing}
        active={active}
      />
    </Interactive>
  );
}
