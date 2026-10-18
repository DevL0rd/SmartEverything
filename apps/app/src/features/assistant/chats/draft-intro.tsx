import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Button } from '../../../components/button';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { hourOf } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useActiveProfile } from '../../../store/people';
import { useAvailability, useSettings } from '../../../store/selectors';
import { AssistantOrb } from '../call/orb';
import { draftGreeting } from '../model/chat-intro';
import { draftSuggestions, runLineOf } from '../model/draft-chat-request';
import type { DraftRun } from '../data/draft-run';
import { DraftKeyCard } from './draft-key-card';

function Suggestions({
  computer,
  onSuggest,
}: {
  readonly computer: boolean;
  readonly onSuggest: (text: string) => void;
}): ReactNode {
  const availability = useAvailability();
  const suggestions = draftSuggestions({
    climate: availability.hasClimate,
    health: availability.hasHealth,
    cameras: availability.hasCameras,
    computer,
  });
  return (
    <View className="w-full max-w-dialog-wide flex-row flex-wrap justify-center gap-2">
      {suggestions.map((text) => (
        <Interactive
          key={text}
          label={text}
          onPress={() => {
            onSuggest(text);
          }}
          className="min-h-touch-min flex-row items-center rounded-full border-hairline border-outline-variant bg-surface-1 px-4"
          layerClassName="rounded-full"
        >
          <Text variant="label" numberOfLines={1}>
            {text}
          </Text>
        </Interactive>
      ))}
    </View>
  );
}

function GreetingTitle(): ReactNode {
  const now = new Date(useMinute());
  const zone = useSettings().time_zone;
  const profile = useActiveProfile();
  return (
    <Text variant="title-2" align="center">
      {draftGreeting(hourOf(now, zone), profile?.name ?? null)}
    </Text>
  );
}

export function DraftIntro({
  run,
  loading,
  needsKey,
  onSuggest,
  onOpenMachine,
  onChooseComputer,
}: {
  readonly run: DraftRun;
  readonly loading: boolean;
  readonly needsKey: boolean;
  readonly onSuggest: (text: string) => void;
  readonly onOpenMachine: () => void;
  readonly onChooseComputer: () => void;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, FadeInUp.duration(300))}
      className="w-full items-center gap-3 px-gutter"
    >
      {loading ? (
        <Skeleton shape="circle" className="size-18" />
      ) : (
        <AssistantOrb state="idle" size={72} paused />
      )}
      <GreetingTitle />
      <Button
        label={runLineOf(run.host, run.access)}
        variant="text"
        hint="Opens machine and model choices"
        onPress={onOpenMachine}
      />
      {needsKey ? (
        <DraftKeyCard onChooseComputer={onChooseComputer} />
      ) : (
        <Suggestions computer={run.computer} onSuggest={onSuggest} />
      )}
    </Animated.View>
  );
}
