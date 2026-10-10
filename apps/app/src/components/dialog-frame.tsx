import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SheetBody } from './sheet-body';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import { cn } from '../design/cn';
import { entering, useMotion } from '../design/motion';
import { Overlay } from './overlay';
import { SheetHeader } from './sheet-header';

export interface DialogFrameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly title?: string | undefined;
  readonly kind: 'dialog' | 'inspector';
  readonly wide?: boolean;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

export function DialogFrame({
  open,
  onClose,
  label,
  title,
  kind,
  wide = false,
  footer,
  scroll = true,
  children,
}: DialogFrameProps): ReactNode {
  const motion = useMotion();
  const dialog = kind === 'dialog';
  return (
    <Overlay
      open={open}
      onClose={onClose}
      label={label}
      scrim
      className={dialog ? 'items-center justify-center p-6' : 'items-end'}
    >
      <Animated.View
        {...entering(motion, dialog ? FadeIn.duration(250) : SlideInRight.duration(250))}
        accessibilityViewIsModal
        aria-modal
        accessibilityLabel={label}
        className={cn(
          'overflow-hidden bg-surface-raised elevation-3',
          dialog ? 'max-h-full w-full rounded-xl' : 'h-full w-inspector max-w-full',
          dialog && (wide ? 'max-w-dialog-wide' : 'max-w-dialog'),
        )}
      >
        <View className="pt-4">
          <SheetHeader title={title} onClose={onClose} touch={false} />
        </View>
        <View className={scroll ? 'shrink' : 'h-picker max-h-full'}>
          <SheetBody scroll={scroll} padding="px-6 pb-6 pt-2">
            {children}
          </SheetBody>
        </View>
        {footer === undefined ? null : (
          <View className="flex-row justify-end gap-2 border-t border-outline-variant px-6 py-4">
            {footer}
          </View>
        )}
      </Animated.View>
    </Overlay>
  );
}
