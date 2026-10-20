import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../components/interactive';
import { Text } from '../components/text';
import { cn } from '../design/cn';
import { AssistantOrb, startCall, useAnyChatWorking } from '../features/assistant';
import { CountPill } from '../components/badge';
import type { NavEntry } from './nav-model';
import { navLabelOf } from './nav-item';
import { useAppCovered } from './root-presentation';

function callFromOrb(): void {
  startCall({ source: 'orb' });
}

export function NavOrb({
  entry,
  onPress,
  onIntent,
}: {
  readonly entry: NavEntry;
  readonly onPress: () => void;
  readonly onIntent: () => void;
}): ReactNode {
  const covered = useAppCovered();
  const working = useAnyChatWorking();
  return (
    <View onPointerEnter={onIntent} className="flex-1">
      <Interactive
        role="tab"
        label={navLabelOf(entry)}
        hint="Hold to call"
        selected={entry.active}
        onPress={onPress}
        onLongPress={callFromOrb}
        className="h-16 w-full items-center justify-center gap-1"
        layerClassName="rounded-full"
      >
        <View
          className={cn(
            'size-11 items-center justify-center rounded-full elevation-2',
            entry.active && 'border-2 border-primary',
          )}
        >
          <AssistantOrb
            state={working ? 'thinking' : 'idle'}
            size={entry.active ? 36 : 40}
            paused={covered}
          />
          {entry.count > 0 ? (
            <View className="absolute -right-1 -top-1">
              <CountPill count={entry.count} />
            </View>
          ) : null}
        </View>
        <Text variant="caption" tone={entry.active ? 'default' : 'variant'} numberOfLines={1}>
          {entry.shortTitle}
        </Text>
      </Interactive>
    </View>
  );
}
