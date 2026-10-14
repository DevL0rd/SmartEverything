import { BrowserOverlayOwner, coverBrowser } from '../platform/browser-overlays';
import type { ReactNode } from 'react';
import { createContext, use, useEffect, useEffectEvent, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { cn } from '../design/cn';
import { useEscape } from './use-escape';

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

interface ShownSignal {
  readonly mark: () => void;
  readonly seen: () => boolean;
  readonly reset: () => void;
}

function createSignal(): ShownSignal {
  let seen = false;
  return {
    mark: (): void => {
      seen = true;
    },
    seen: (): boolean => seen,
    reset: (): void => {
      seen = false;
    },
  };
}

const NO_SIGNAL: ShownSignal = createSignal();

const OverlayShown = createContext<ShownSignal>(NO_SIGNAL);

export function useOverlayShown(): () => void {
  return use(OverlayShown).mark;
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

export interface OverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly label: string;
  readonly scrim: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Overlay({
  open,
  onClose,
  label,
  scrim,
  className,
  children,
}: OverlayProps): ReactNode {
  const [signal] = useState(createSignal);
  const browserOwner = use(BrowserOverlayOwner);
  useEffect(() => {
    if (open) return coverBrowser(browserOwner);
    return undefined;
  }, [open, browserOwner]);
  useEscape(open, onClose);
  useContentWatchdog(open, label, signal, onClose);
  return (
    <Modal
      transparent
      visible={open}
      onRequestClose={onClose}
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View className={cn('flex-1', className)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${label}`}
          onPress={onClose}
          className={cn('absolute inset-0', scrim && 'bg-scrim')}
        />
        <OverlayShown value={signal}>{children}</OverlayShown>
      </View>
    </Modal>
  );
}
