import * as Haptics from 'expo-haptics';
import { Logger } from '@smarteverything/logging';
import { isNative } from '../design/platform';

const log = new Logger('app.haptics');

function felt(feedback: Promise<void>): void {
  feedback.catch((error: unknown) => {
    log.warn('haptics.unavailable', { reason: String(error) });
  });
}

export function selectionTick(): void {
  if (isNative()) {
    felt(Haptics.selectionAsync());
  }
}

export function warningBuzz(): void {
  if (isNative()) {
    felt(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  }
}

export function heavyThud(): void {
  if (isNative()) {
    felt(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }
}
