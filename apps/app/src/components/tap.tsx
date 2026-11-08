import type { ReactNode, Ref } from 'react';
import { Pressable, type AccessibilityRole, type View } from 'react-native';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { spaceKeyProps } from './space-key';

export interface TapProps {
  readonly label: string;
  readonly role: AccessibilityRole;
  readonly checked?: boolean;
  readonly focusable?: boolean;
  readonly disabled?: boolean;
  readonly className: string;
  readonly innerRef?: Ref<View> | undefined;
  readonly onPress: () => void;
  readonly children: ReactNode;
}

export function Tap({
  label,
  role,
  checked,
  focusable = true,
  disabled = false,
  className,
  innerRef,
  onPress,
  children,
}: TapProps): ReactNode {
  const tabStop = focusable && !disabled;
  return (
    <Pressable
      ref={innerRef}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
        ...(checked === undefined ? {} : { checked, selected: checked }),
      }}
      aria-checked={checked}
      {...spaceKeyProps(role, disabled, onPress)}
      focusable={tabStop}
      tabIndex={isNative() ? undefined : tabStop ? 0 : -1}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'overflow-hidden focus:outline-2 focus:outline-focus focus:outline-offset-2 hover:bg-on-surface/6 active:bg-on-surface/10',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </Pressable>
  );
}
