import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';
import type { Tone } from './tone';

type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'destructive';

interface Look {
  readonly frame: string;
  readonly tone: Tone;
  readonly spinner: string;
}

const LOOK: Readonly<Record<ButtonVariant, Look>> = {
  filled: { frame: 'bg-primary', tone: 'onPrimary', spinner: 'accent-on-primary' },
  tonal: { frame: 'bg-primary-container', tone: 'primary', spinner: 'accent-primary' },
  outlined: { frame: 'border border-outline', tone: 'default', spinner: 'accent-on-surface' },
  text: { frame: '', tone: 'primary', spinner: 'accent-primary' },
  destructive: { frame: 'bg-critical/14', tone: 'critical', spinner: 'accent-critical' },
};

export interface ButtonProps {
  readonly label: string;
  readonly onPress?: () => void;
  readonly href?: Href;
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'lg';
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly grow?: boolean;
  readonly hint?: string;
}

interface FrameInput {
  readonly look: Look;
  readonly size: 'md' | 'lg';
  readonly pointer: boolean;
  readonly grow: boolean;
  readonly disabled: boolean;
}

function frameOf({ look, size, pointer, grow, disabled }: FrameInput): string {
  return cn(
    'max-w-full shrink flex-row items-center justify-center gap-2 px-4',
    size === 'lg' ? 'min-h-touch-min px-6' : 'h-control-h',
    pointer ? 'rounded-sm' : 'rounded-full',
    grow && 'flex-1',
    disabled ? 'bg-on-surface/10' : look.frame,
  );
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
  hint,
}: ButtonProps): ReactNode {
  const look = LOOK[variant];
  const pointer = useIdiom() === 'pointer';
  return (
    <Interactive
      onPress={onPress}
      href={href}
      disabled={disabled || loading}
      label={label}
      hint={hint}
      onTone={variant === 'filled' ? 'primary' : 'surface'}
      className={frameOf({ look, size, pointer, grow, disabled })}
      layerClassName={pointer ? 'rounded-sm' : 'rounded-full'}
    >
      <Leading icon={icon} loading={loading} look={look} pointer={pointer} disabled={disabled} />
      <View className="shrink">
        <Text variant="label" tone={disabled ? 'faint' : look.tone} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Interactive>
  );
}
