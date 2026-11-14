import type { ReactNode, Ref } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { useBandHitSlop, useCompactBand } from './widget-board/band-context';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';
import type { Tone } from './tone';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'destructive';

interface Look {
  readonly frame: string;
  readonly off: string;
  readonly tone: Tone;
  readonly spinner: string;
}

const FILLED_OFF = 'bg-on-surface/10';

const LOOK: Readonly<Record<ButtonVariant, Look>> = {
  filled: { frame: 'bg-primary', off: FILLED_OFF, tone: 'onPrimary', spinner: 'accent-on-primary' },
  tonal: {
    frame: 'bg-primary-container',
    off: FILLED_OFF,
    tone: 'onPrimaryContainer',
    spinner: 'accent-on-primary-container',
  },
  outlined: {
    frame: 'border border-outline',
    off: 'border border-outline-variant',
    tone: 'default',
    spinner: 'accent-on-surface',
  },
  text: { frame: '', off: '', tone: 'primary', spinner: 'accent-primary' },
  destructive: {
    frame: 'bg-critical/14',
    off: FILLED_OFF,
    tone: 'critical',
    spinner: 'accent-critical',
  },
};

export interface ButtonProps {
  readonly label: string;
  readonly spoken?: string;
  readonly onPress?: () => void;
  readonly href?: AppHref;
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'lg';
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly grow?: boolean;
  readonly wrap?: boolean;
  readonly hint?: string;
  readonly ref?: Ref<View>;
}

interface FrameInput {
  readonly look: Look;
  readonly size: 'md' | 'lg';
  readonly pointer: boolean;
  readonly grow: boolean;
  readonly wrap: boolean;
  readonly disabled: boolean;
}

function controlShaped(size: 'md' | 'lg', wrap: boolean): boolean {
  return size === 'md' && !wrap;
}

function radiusOf(pointer: boolean): string {
  return pointer ? 'rounded-sm' : 'rounded-full';
}

function frameOf({ look, size, pointer, grow, wrap, disabled }: FrameInput): string {
  return cn(
    'max-w-full shrink flex-row items-center justify-center gap-2 px-4',
    size === 'lg' && 'px-6',
    controlShaped(size, wrap) ? 'h-control-h' : 'min-h-touch-min',
    radiusOf(pointer),
    grow && 'flex-1',
    wrap && 'py-2',
    disabled ? look.off : look.frame,
  );
}

function iconFrameOf(look: Look, pointer: boolean, disabled: boolean): string {
  return cn(
    'size-control-h items-center justify-center',
    radiusOf(pointer),
    disabled ? look.off : look.frame,
  );
}

function shapedFrameOf(iconOnly: boolean, input: FrameInput): string {
  return iconOnly ? iconFrameOf(input.look, input.pointer, input.disabled) : frameOf(input);
}

function LabelSlot({
  show,
  label,
  look,
  disabled,
  wrap,
}: {
  readonly show: boolean;
  readonly label: string;
  readonly look: Look;
  readonly disabled: boolean;
  readonly wrap: boolean;
}): ReactNode {
  return show ? <ButtonLabel label={label} look={look} disabled={disabled} wrap={wrap} /> : null;
}

function useButtonShape(
  hasIcon: boolean,
  size: FrameInput['size'],
  wrap: boolean,
): { readonly iconOnly: boolean; readonly hitSlop: ReturnType<typeof useBandHitSlop> } {
  const iconOnly = useCompactBand() && hasIcon;
  return { iconOnly, hitSlop: useBandHitSlop(iconOnly || controlShaped(size, wrap)) };
}

function Leading({
  icon,
  loading,
  look,
  pointer,
  disabled,
}: {
  readonly icon: IconName | undefined;
  readonly loading: boolean;
  readonly look: Look;
  readonly pointer: boolean;
  readonly disabled: boolean;
}): ReactNode {
  if (loading) {
    return <ActivityIndicator size="small" colorClassName={look.spinner} />;
  }
  return icon === undefined ? null : (
    <Icon name={icon} size={pointer ? 16 : 20} tone={disabled ? 'faint' : look.tone} />
  );
}

function ButtonLabel({
  label,
  look,
  disabled,
  wrap = false,
}: {
  readonly label: string;
  readonly look: Look;
  readonly disabled: boolean;
  readonly wrap?: boolean;
}): ReactNode {
  return (
    <View className="shrink">
      <Text
        variant="label"
        tone={disabled ? 'faint' : look.tone}
        numberOfLines={wrap ? undefined : 1}
        className={wrap ? 'web:wrap-anywhere' : ''}
      >
        {label}
      </Text>
    </View>
  );
}

export function ButtonSample({
  label,
  variant = 'filled',
}: Pick<ButtonProps, 'label' | 'variant'>): ReactNode {
  const look = LOOK[variant];
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      className={frameOf({ look, size: 'md', pointer, grow: false, wrap: false, disabled: false })}
    >
      <ButtonLabel label={label} look={look} disabled={false} />
    </View>
  );
}

export function Button({
  label,
  onPress,
  href,
  variant = 'filled',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  grow = false,
  wrap = false,
  hint,
  spoken,
  ref,
}: ButtonProps): ReactNode {
  const look = LOOK[variant];
  const pointer = useIdiom() === 'pointer';
  const { iconOnly, hitSlop } = useButtonShape(icon !== undefined, size, wrap);
  return (
    <Interactive
      ref={ref}
      hitSlop={hitSlop}
      onPress={onPress}
      href={href}
      disabled={disabled || loading}
      label={spoken ?? label}
      hint={hint}
      onTone={variant === 'filled' ? 'primary' : 'surface'}
      className={shapedFrameOf(iconOnly, { look, size, pointer, grow, wrap, disabled })}
      layerClassName={radiusOf(pointer)}
    >
      <Leading icon={icon} loading={loading} look={look} pointer={pointer} disabled={disabled} />
      <LabelSlot show={!iconOnly} label={label} look={look} disabled={disabled} wrap={wrap} />
    </Interactive>
  );
}
