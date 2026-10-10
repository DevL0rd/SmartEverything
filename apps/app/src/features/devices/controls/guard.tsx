import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { notify } from '../../../components/toast-store';

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
          notify({ message: reason });
        }}
      >
        <View />
      </Interactive>
    </View>
  );
}

export function offlineReason(name: string): string {
  return `${name} is offline`;
}

export function poweredOffReason(name: string): string {
  return `Turn ${name} on first`;
}
