import type { ReactNode } from 'react';
import { Pressable, type AccessibilityRole, type View } from 'react-native';
import { cn } from '../design/cn';

export interface TapProps {
  readonly label: string;
  readonly role: AccessibilityRole;
  readonly checked?: boolean;
  readonly focusable?: boolean;
  readonly disabled?: boolean;
  readonly className: string;
  readonly innerRef?: (node: View | null) => void;
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
      focusable={focusable}
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
