import type { ReactNode, Ref } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { bandHitSlop, useBand } from './widget-board/band-context';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import type { ControlSize } from './segmented';
import { Tooltip, type TooltipPlacement } from './tooltip';
import type { Tone } from './tone';

type IconButtonVariant = 'standard' | 'tonal' | 'filled' | 'overlay' | 'raised';

const FRAME: Readonly<Record<IconButtonVariant, string>> = {
  standard: '',
  tonal: 'bg-surface-2',
  filled: 'bg-primary',
  overlay: 'bg-scrim',
  raised: 'border-hairline border-outline-variant bg-surface-raised',
};

const SELECTED_FRAME: Readonly<Record<IconButtonVariant, string>> = {
  standard: 'bg-primary-container',
  tonal: 'bg-primary-container',
  filled: 'bg-primary',
  overlay: 'bg-primary-container',
  raised: 'border-hairline border-primary bg-primary',
};

function onPrimary(variant: IconButtonVariant, selected: boolean): boolean {
  return variant === 'filled' || (variant === 'raised' && selected);
}

function toneOf(variant: IconButtonVariant, selected: boolean, tone: Tone | undefined): Tone {
  if (onPrimary(variant, selected)) {
    return 'onPrimary';
  }
  if (tone !== undefined) {
    return tone;
  }
  if (selected) {
    return 'primary';
  }
  return variant === 'overlay' || variant === 'raised' ? 'default' : 'variant';
}

function frameOf(variant: IconButtonVariant, selected: boolean, size: ControlSize): string {
  return cn(
    size === 'control' ? 'size-control-h' : 'size-touch-min',
    'items-center justify-center rounded-full',
    selected ? SELECTED_FRAME[variant] : FRAME[variant],
  );
}

function useBandShape(size: ControlSize | undefined): {
  readonly shape: ControlSize;
  readonly hitSlop: number | undefined;
} {
  const band = useBand();
  const shape = size ?? (band === null ? 'touch' : 'control');
  return { shape, hitSlop: bandHitSlop(band, shape === 'control') };
}

function tipOf(label: string, shortcut: string | undefined): string {
  return shortcut === undefined ? label : `${label} · ${shortcut}`;
}

export interface IconButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly href?: AppHref;
  readonly variant?: IconButtonVariant;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly shortcut?: string;
  readonly tone?: Tone;
  readonly tooltip?: TooltipPlacement;
  readonly size?: ControlSize;
  readonly ref?: Ref<View>;
}

function HoverTip({
  text,
  placement,
  children,
}: {
  readonly text: string;
  readonly placement: TooltipPlacement;
  readonly children: ReactNode;
}): ReactNode {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      className="relative"
      onPointerEnter={(): void => {
        setHovered(true);
      }}
      onPointerLeave={(): void => {
        setHovered(false);
      }}
    >
      {children}
      {hovered ? <Tooltip text={text} placement={placement} /> : null}
    </View>
  );
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
  tone,
  tooltip,
  size,
  ref,
}: IconButtonProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const { shape, hitSlop } = useBandShape(size);
  const button = (
    <Interactive
      ref={ref}
      hitSlop={hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      href={href}
      label={label}
      selected={selected}
      disabled={disabled}
      onTone={onPrimary(variant, selected) ? 'primary' : 'surface'}
      className={frameOf(variant, selected, shape)}
      layerClassName="rounded-full"
    >
      <Icon name={icon} size={pointer ? 20 : 24} tone={toneOf(variant, selected, tone)} />
    </Interactive>
  );
  if (!pointer) return button;
  return (
    <HoverTip text={tipOf(label, shortcut)} placement={tooltip ?? 'below'}>
      {button}
    </HoverTip>
  );
}
