import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Keyboard, Platform, View, type KeyboardMetrics } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';
import { useMeasuredFrame, type Frame } from './toast-obstacles';

const log = new Logger('app.keyboard');

async function keyboardMetricsOf(metrics: KeyboardMetrics | null): Promise<KeyboardMetrics | null> {
  if (
    Platform.OS === 'ios' &&
    metrics !== null &&
    metrics.screenY === 0 &&
    (await AccessibilityInfo.prefersCrossFadeTransitions())
  ) {
    return null;
  }
  return metrics;
}

function useKeyboardMetrics(): KeyboardMetrics | null {
  const [metrics, setMetrics] = useState<KeyboardMetrics | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    let revision = 0;
    const synchronize = (next: KeyboardMetrics | null): void => {
      const current = ++revision;
      void keyboardMetricsOf(next).then(
        (resolved) => {
          if (current === revision) setMetrics(resolved);
        },
        (cause: unknown) => {
          if (current !== revision) return;
          log.warn('keyboard.accessibility_failed', { reason: String(cause) });
          setMetrics(null);
        },
      );
    };
    const shown = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        Keyboard.scheduleLayoutAnimation(event);
        synchronize(event.endCoordinates);
      },
    );
    const hidden = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (event) => {
        Keyboard.scheduleLayoutAnimation(event);
        synchronize(null);
      },
    );
    synchronize(Keyboard.metrics() ?? null);
    return (): void => {
      revision += 1;
      shown.remove();
      hidden.remove();
    };
  }, []);
  return metrics;
}

export function KeyboardViewport({ children }: { readonly children: ReactNode }): ReactNode {
  const [frame, setFrame] = useState<Frame | null>(null);
  const { attach, onLayout } = useMeasuredFrame(setFrame);
  const keyboard = useKeyboardMetrics();
  const overlap =
    frame === null || keyboard === null
      ? 0
      : Math.max(0, frame.y + frame.height - keyboard.screenY);
  return (
    <View
      ref={attach}
      onLayout={onLayout}
      className="flex-1"
      style={isNative() ? { paddingBottom: overlap } : undefined}
    >
      {children}
    </View>
  );
}
