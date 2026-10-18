import { useEffect, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Logger } from '@smarteverything/logging';

const log = new Logger('app.startup');

const SHOW_AFTER_MS = 8000;

export function StartupPending({ stage }: { readonly stage: string }): ReactNode {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      log.warn('startup.stalled', { stage, waitedMs: Date.now() - startedAt });
      setLate(true);
    }, SHOW_AFTER_MS);
    return (): void => {
      clearTimeout(timer);
      if (Date.now() - startedAt >= SHOW_AFTER_MS) {
        log.info('startup.resumed', { stage, waitedMs: Date.now() - startedAt });
      }
    };
  }, [stage]);
  if (!late) {
    return null;
  }
  return (
    <View className="flex-1 items-center justify-center bg-bg p-6">
      <Text accessibilityRole="alert" className="text-center text-body text-on-surface">
        {`SmartEverything is still starting: ${stage}`}
      </Text>
    </View>
  );
}
