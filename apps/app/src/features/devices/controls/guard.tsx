import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { Interactive } from '../../../components/interactive';
import { notify } from '../../../components/toast-store';

const log = new Logger('app.devices');

export function Guard({
  reason,
  children,
}: {
  readonly reason: string | null;
  readonly children: ReactNode;
}): ReactNode {
  if (reason === null) {
    return children;
  }
  return (
    <View className="relative">
      {children}
      <Interactive
        label={reason}
        className="absolute inset-0"
        layerClassName="rounded-md"
        onPress={() => {
          log.debug('control.blocked', { reason });
          notify({ message: reason });
        }}
      >
        <View />
      </Interactive>
    </View>
  );
}

export const UNREACHABLE_REASON = 'Not reachable. Check its Wi‑Fi.';

export function offlineReason(name: string): string {
  return `${name} is offline`;
}

export function poweredOffReason(name: string): string {
  return `Turn ${name} on first`;
}
