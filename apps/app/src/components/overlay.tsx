import { BrowserOverlayOwner, coverBrowser } from '../platform/browser-overlays';
import type { ReactNode, RefObject } from 'react';
import { use, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { cn } from '../design/cn';
import { isNative } from '../design/platform';
import { focusView } from './focus-request';
import { KeyboardRoot, KeyboardViewport } from './keyboard-viewport';
import { ToastModal } from './toast-modal';
import { useEscape } from './use-escape';

import { createSignal, OverlayShown, type ShownSignal } from './overlay-shown';
export { useOverlayShown } from './overlay-shown';

const log = new Logger('app.overlay');

const CONTENT_DEADLINE_MS = 3000;

class OverlayContentNotVisibleError extends Error {
  override readonly name = 'OverlayContentNotVisibleError';

  constructor(readonly component: string) {
    super(
      `The overlay "${component}" showed its backdrop but its content was not visible after ${String(CONTENT_DEADLINE_MS)} ms.`,
    );
  }
}

function useContentWatchdog(
  open: boolean,
  label: string,
  signal: ShownSignal,
  onClose: () => void,
): void {
  const giveUp = useEffectEvent(() => {
    if (!signal.seen()) {
      log.exception('overlay.content_not_visible', new OverlayContentNotVisibleError(label), {
        component: label,
      });
      onClose();
    }
  });
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = setTimeout(giveUp, CONTENT_DEADLINE_MS);
    return (): void => {
      clearTimeout(timer);
      signal.reset();
    };
  }, [open, signal]);
}

function useOverlayLog(open: boolean, label: string, scrim: boolean, signal: ShownSignal): void {
  useEffect(() => {
    if (!open) return undefined;
    const openedAt = Date.now();
    log.info('overlay.opened', { component: label, scrim });
    return (): void => {
      log.info('overlay.closed', {
        component: label,
        visibleMs: Date.now() - openedAt,
        contentShown: signal.seen(),
      });
    };
  }, [open, label, scrim, signal]);
}

export interface OverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onBack?: (() => void) | undefined;
  readonly label: string;
  readonly scrim: boolean;
  readonly className?: string | undefined;
  readonly backdropLabel?: string | undefined;
  readonly initialFocus?: RefObject<View | null> | undefined;
  readonly pointerBackdrop?: boolean | undefined;
  readonly children: ReactNode;
}

function OverlaySurface({
  className,
  signal,
  initialFocus,
  backdropLabel,
  onClose,
  scrim,
  pointerBackdrop,
  children,
}: Pick<
  OverlayProps,
  'className' | 'initialFocus' | 'onClose' | 'scrim' | 'children' | 'pointerBackdrop'
> & {
  readonly signal: ShownSignal;
  readonly backdropLabel: string;
}): ReactNode {
  const panel = useRef<View>(null);
  return (
    <KeyboardRoot>
      <KeyboardViewport className="z-0 flex-1">
        <View ref={panel} pointerEvents="box-none" className={cn('flex-1', className)}>
          <OverlayShown value={signal}>{children}</OverlayShown>
        </View>
        {pointerBackdrop === true ? (
          <View
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            onStartShouldSetResponder={() => true}
            onResponderRelease={onClose}
            className={cn('absolute inset-0 -z-10', scrim && 'bg-scrim')}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backdropLabel}
            onFocus={() => {
              if (!isNative()) focusView(initialFocus?.current ?? panel.current);
            }}
            onPress={onClose}
            tabIndex={-1}
            className={cn('absolute inset-0 -z-10', scrim && 'bg-scrim')}
          />
        )}
      </KeyboardViewport>
    </KeyboardRoot>
  );
}

function focusOverlayEntry(
  initialFocus: OverlayProps['initialFocus'],
  staticTarget: boolean,
): void {
  if (initialFocus === undefined) return;
  requestAnimationFrame(() => {
    focusView(initialFocus.current, staticTarget);
  });
}

export function Overlay({
  open,
  onClose,
  onBack = onClose,
  label,
  scrim,
  className,
  backdropLabel,
  initialFocus,
  pointerBackdrop,
  children,
}: OverlayProps): ReactNode {
  const [signal] = useState(createSignal);
  const browserOwner = use(BrowserOverlayOwner);
  useEffect(() => {
    if (open) return coverBrowser(browserOwner);
    return undefined;
  }, [open, browserOwner]);
  useOverlayLog(open, label, scrim, signal);
  useEscape(open, onClose);
  useContentWatchdog(open, label, signal, onClose);
  return (
    <ToastModal
      transparent
      visible={open}
      accessibilityLabel={label}
      onRequestClose={isNative() ? onBack : undefined}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => focusOverlayEntry(initialFocus, pointerBackdrop === true)}
    >
      <OverlaySurface
        className={className}
        signal={signal}
        initialFocus={initialFocus}
        pointerBackdrop={pointerBackdrop}
        backdropLabel={backdropLabel ?? `Close ${label}`}
        onClose={onClose}
        scrim={scrim}
      >
        {children}
      </OverlaySurface>
    </ToastModal>
  );
}
