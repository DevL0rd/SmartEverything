import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../components/interactive';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import { AssistantOrb, startCall } from '../features/assistant';
import type { NavEntry } from './nav-model';

export function NavOrb({
  entry,
  onPress,
  onIntent,
}: {
  readonly entry: NavEntry;
  readonly onPress: () => void;
  readonly onIntent: () => void;
}): ReactNode {
  return (
    <View onPointerEnter={onIntent} className="flex-1">
      <Interactive
        role="tab"
        label={entry.route.title}
        hint="Hold to call"
        selected={entry.active}
        onPress={onPress}
        onLongPress={() => {
          startCall({ source: 'orb' });
        }}
        className="h-16 w-full items-center justify-center gap-1"
        layerClassName="rounded-full"
      >
        <View
          className={cn(
            'size-11 items-center justify-center rounded-full elevation-2',
            entry.active && 'border-2 border-primary',
          )}
        >
          <AssistantOrb state="idle" size={entry.active ? 36 : 40} />
        </View>
        <Text variant="caption" tone={entry.active ? 'default' : 'variant'} numberOfLines={1}>
          {entry.route.shortTitle ?? entry.route.title}
        </Text>
      </Interactive>
    </View>
  );
}
