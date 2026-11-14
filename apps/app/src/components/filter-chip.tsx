import type { ReactNode, Ref, RefObject } from 'react';
import { View } from 'react-native';
import { FlatChoice } from './flat-choice';
import type { IconName } from './icon-glyphs';
import { count as formatCount } from '../format/number';

export interface FilterChipProps {
  readonly label: string;
  readonly value: string;
  readonly icon?: IconName | undefined;
  readonly swatchClassName?: string | undefined;
  readonly count?: number;
  readonly active: boolean;
  readonly affordance?: 'menu' | 'remove' | undefined;
  readonly singleChoice?: boolean;
  readonly expanded?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onPress: () => void;
  readonly anchorRef?: RefObject<View | null>;
  readonly pressRef?: Ref<View>;
}

export function FilterChip({
  label,
  value,
  icon,
  swatchClassName,
  count,
  active,
  affordance,
  expanded,
  disabled,
  singleChoice = false,
  onPress,
  anchorRef,
  pressRef,
}: FilterChipProps): ReactNode {
  return (
    <View ref={anchorRef}>
      <FlatChoice
        ref={pressRef}
        spoken={`${label}: ${value}${count === undefined ? '' : `, ${formatCount(count)}`}`}
        label={value}
        icon={icon}
        swatchClassName={swatchClassName}
        count={count}
        active={active}
        expanded={expanded}
        disabled={disabled}
        menu={affordance === 'menu'}
        role={affordance === undefined ? (singleChoice ? 'radio' : 'checkbox') : 'button'}
        trailing={
          affordance === 'remove' ? 'close' : affordance === 'menu' ? 'chevronDown' : undefined
        }
        onPress={onPress}
      />
    </View>
  );
}
