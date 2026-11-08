import type { Engine } from '@smarteverything/domain';
import { useRef, type ReactNode, type RefObject } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { entering, useMotion } from '../../../design/motion';
import { hourOf } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useActiveProfile } from '../../../store/people';
import { useSettings } from '../../../store/selectors';
import { AssistantOrb } from '../call/orb';
import { draftGreeting } from '../model/chat-intro';
import type { DraftRun } from '../data/draft-run';
import { DraftEnginePicker } from './draft-engine-picker';
import { DraftKeyCard } from './draft-key-card';

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
  engine,
  onEngine,
  onCoordinator,
  onOpenMachine,
  onChooseComputer,
}: {
  readonly run: DraftRun;
  readonly loading: boolean;
  readonly needsKey: boolean;
  readonly engine: Engine;
  readonly onEngine: (engine: Engine) => void;
  readonly onCoordinator: () => void;
  readonly onOpenMachine: () => void;
  readonly onChooseComputer: () => void;
}): ReactNode {
  const motion = useMotion();
  const deviceAnchorRef = useRef<View>(null);
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
      <View className="w-full max-w-dialog flex-row items-center gap-2">
        <DraftEnginePicker
          engine={engine}
          onChange={onEngine}
          onCoordinator={onCoordinator}
          deviceAnchorRef={deviceAnchorRef}
        />
        <DeviceTrigger anchorRef={deviceAnchorRef} host={run.host} onPress={onOpenMachine} />
      </View>
      {needsKey ? <DraftKeyCard onChooseComputer={onChooseComputer} /> : null}
    </Animated.View>
  );
}

function DeviceTrigger({
  anchorRef,
  host,
  onPress,
}: {
  readonly anchorRef: RefObject<View | null>;
  readonly host: string;
  readonly onPress: () => void;
}): ReactNode {
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  return (
    <View ref={anchorRef} className="min-w-0 flex-1">
      <Interactive
        label={`Device, ${host}`}
        expanded={operation === 'device' || operation === 'engine-computer'}
        onPress={onPress}
        className="min-h-14 flex-row items-center gap-1.5 rounded-lg border-hairline border-outline bg-surface-2 px-2.5"
        layerClassName="rounded-lg"
      >
        <Icon name="monitor" size={16} tone="variant" />
        <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
          {host}
        </Text>
        <Icon name="chevronDown" size={16} tone="variant" />
      </Interactive>
    </View>
  );
}
