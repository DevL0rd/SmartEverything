import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SheetBody } from './sheet-body';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cn } from '../design/cn';
import { entering, useMotion, type MotionPreference } from '../design/motion';
import { isNative } from '../design/platform';
import { focusView } from './focus-request';
import { Overlay, useOverlayShown } from './overlay';
import { SheetHeader, useSheetHeading } from './sheet-header';

export interface DialogFrameProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly title?: string | undefined;
  readonly kind: 'dialog' | 'inspector';
  readonly wide?: boolean;
  readonly footer?: ReactNode;
  readonly scroll?: boolean;
  readonly reading?: boolean;
  readonly initialFocus?: RefObject<View | null>;
  readonly children: ReactNode;
}

function useDialogEntry(
  kind: DialogFrameProps['kind'],
  motion: MotionPreference,
  initialFocus: RefObject<View | null> | undefined,
): { readonly ref: RefObject<View | null> } & ReturnType<typeof entering> {
  const ref = useRef<View>(null);
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!entered) return;
    if (initialFocus !== undefined) {
      focusView(initialFocus.current);
    } else if (!isNative()) {
      const panel: unknown = ref.current;
      if (panel instanceof HTMLElement && !panel.contains(document.activeElement)) {
        focusView(ref.current);
      }
    }
  }, [entered, initialFocus]);
  if (motion.reduced) return { ref };
  const appear = (kind === 'dialog' ? FadeIn : SlideInRight)
    .duration(250)
    .withCallback((finished) => {
      'worklet';
      if (finished) scheduleOnRN(setEntered, true);
    });
  return { ref, ...entering(motion, appear) };
}

function DialogPanel({
  title,
  onClose,
  kind,
  wide,
  footer,
  scroll,
  reading,
  titleFocus,
  initialFocus,
  motion,
  children,
}: Omit<DialogFrameProps, 'open' | 'label'> & {
  readonly wide: boolean;
  readonly scroll: boolean;
  readonly titleFocus: RefObject<View | null> | undefined;
  readonly motion: MotionPreference;
}): ReactNode {
  const entry = useDialogEntry(kind, motion, initialFocus);
  const shown = useOverlayShown();
  const dialog = kind === 'dialog';
  return (
    <Animated.View
      {...entry}
      onLayout={shown}
      className={cn(
        'overflow-hidden bg-surface-raised elevation-3',
        dialog ? 'max-h-full w-full rounded-xl' : 'h-full w-inspector max-w-full',
        dialog && (wide ? 'max-w-dialog-wide' : 'max-w-dialog'),
      )}
    >
      <View className="pt-4">
        <SheetHeader title={title} onClose={onClose} touch={false} titleFocus={titleFocus} />
      </View>
      <View className={scroll ? 'shrink' : 'h-picker max-h-full'}>
        <SheetBody scroll={scroll} reading={reading === true} padding="px-6 pb-6 pt-2">
          {children}
        </SheetBody>
      </View>
      {footer === undefined ? null : (
        <View className="flex-row justify-end gap-2 border-t border-outline-variant px-6 py-4">
          {footer}
        </View>
      )}
    </Animated.View>
  );
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
  reading = false,
  initialFocus,
  children,
}: DialogFrameProps): ReactNode {
  const motion = useMotion();
  const titleFocus = useSheetHeading(reading);
  return (
    <Overlay
      open={open}
      onClose={onClose}
      label={label}
      initialFocus={titleFocus ?? (motion.reduced ? initialFocus : undefined)}
      pointerBackdrop={reading}
      scrim
      className={kind === 'dialog' ? 'items-center justify-center p-6' : 'items-end'}
    >
      <DialogPanel
        onClose={onClose}
        title={title}
        kind={kind}
        wide={wide}
        footer={footer}
        scroll={scroll}
        reading={reading}
        titleFocus={titleFocus}
        motion={motion}
        {...(initialFocus === undefined ? {} : { initialFocus })}
      >
        {children}
      </DialogPanel>
    </Overlay>
  );
}
