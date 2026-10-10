import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Tooltip } from './tooltip';
import type { Tone } from './tone';

type IconButtonVariant = 'standard' | 'tonal' | 'filled' | 'overlay';

const FRAME: Readonly<Record<IconButtonVariant, string>> = {
  standard: '',
  tonal: 'bg-surface-2',
  filled: 'bg-primary',
  overlay: 'bg-scrim',
};

function toneOf(variant: IconButtonVariant, selected: boolean): Tone {
  if (variant === 'filled') {
    return 'onPrimary';
  }
  if (selected) {
    return 'primary';
  }
  return variant === 'overlay' ? 'default' : 'variant';
}

function frameOf(variant: IconButtonVariant, selected: boolean): string {
  return cn(
    'size-touch-min items-center justify-center rounded-full',
    FRAME[variant],
    selected && variant !== 'filled' && 'bg-primary-container',
  );
}

export interface IconButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly href?: Href;
  readonly variant?: IconButtonVariant;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
}

export function IconButton({
  icon,
  label,
  onPress,
  onLongPress,
  href,
  variant = 'standard',
  selected = false,
  disabled = false,
  shortcut,
}: IconButtonProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  return (
    <View
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        onPress={onPress}
        onLongPress={onLongPress}
        href={href}
        label={label}
        selected={selected}
        disabled={disabled}
        onTone={variant === 'filled' ? 'primary' : 'surface'}
        className={frameOf(variant, selected)}
        layerClassName="rounded-full"
      >
        <Icon name={icon} size={pointer ? 20 : 24} tone={toneOf(variant, selected)} />
      </Interactive>
      {pointer && hovered ? (
        <Tooltip text={shortcut === undefined ? label : `${label} · ${shortcut}`} />
      ) : null}
    </View>
  );
}
