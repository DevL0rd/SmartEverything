import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { useCameraEntries } from '../data/use-cameras';

export function CameraDots({ deviceId }: { readonly deviceId: string }): ReactNode {
  const entries = useCameraEntries();
  if (entries.length < 2) {
    return null;
  }
  const index = entries.findIndex((entry) => entry.device.id === deviceId);
  return (
    <View
      accessible
      accessibilityLabel={`Camera ${String(index + 1)} of ${String(entries.length)}. Swipe the picture to switch.`}
      className="flex-row items-center gap-1.5 px-1"
    >
      {entries.map((entry) => (
        <View
          key={entry.device.id}
          className={cn(
            'size-1.5 rounded-full',
            entry.device.id === deviceId ? 'bg-white' : 'bg-white/40',
          )}
        />
      ))}
    </View>
  );
}
