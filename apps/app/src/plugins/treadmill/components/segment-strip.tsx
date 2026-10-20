import type { SessionDetail } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { stripParts } from '../model/profile-model';
import { ZONE_DOT } from '../model/treadmill-model';

function growOf(grow: number): { readonly flexGrow: number } {
  return { flexGrow: grow };
}

export function SegmentStrip({
  segments,
}: {
  readonly segments: SessionDetail['segments'];
}): ReactNode {
  const parts = stripParts(segments);
  if (parts.length === 0) {
    return null;
  }
  const paused = segments.filter((segment) => segment.state === 'paused').length;
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Active and paused time, ${String(parts.length)} parts, ${String(paused)} pauses`}
        className="h-4 flex-row gap-0.5 overflow-hidden rounded-full"
      >
        {parts.map((part) => (
          <View
            key={part.key}
            style={growOf(part.grow)}
            className={cn(
              'h-full basis-0',
              part.zone === null
                ? 'bg-surface-3 border-hairline border-outline'
                : ZONE_DOT[part.zone],
            )}
          />
        ))}
      </View>
      <Text variant="caption" tone="faint">
        Colours are the speed zones. Paused time is the plain outlined gaps.
      </Text>
    </View>
  );
}
