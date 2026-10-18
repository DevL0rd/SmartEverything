import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import { DURATION, useMotion } from '../../../../design/motion';
import { useAssistantName } from '../../data/assistant-data';
import { callActive, orbStateOf, useCall, type CallView } from '../call-state';
import { AssistantOrb } from '../orb';
import { useCallAudio } from './call-audio-pref';
import { MicMeter } from './mic-meter';

const STRIP_ORB = 36;

function HeardDot({ on }: { readonly on: boolean }): ReactNode {
  const motion = useMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (on && !motion.reduced) {
      scale.set(
        withSequence(
          withTiming(1.5, { duration: DURATION.short }),
          withTiming(1, { duration: DURATION.medium }),
        ),
      );
    }
  }, [on, motion.reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <View className="flex-row items-center gap-1.5">
      <Animated.View
        style={style}
        className={cn('size-2 rounded-full', on ? 'bg-positive' : 'bg-on-surface-faint/40')}
      />
      <Text variant="caption" tone={on ? 'default' : 'faint'}>
        Heard you
      </Text>
    </View>
  );
}

function captionOf(call: CallView, name: string): string {
  if (!callActive(call)) {
    return 'Your level shows here during a call';
  }
  if (call.echoTest.status === 'running') {
    return 'Paused during the echo test';
  }
  return call.muted ? `Muted: ${name} can’t hear you` : 'Speak to see your level';
}

export function LiveStrip({
  call,
  name,
}: {
  readonly call: CallView;
  readonly name: string;
}): ReactNode {
  const { pref } = useCallAudio();
  const testing = call.echoTest.status === 'running';
  const running = callActive(call) && !testing;
  const heard = running && !call.muted && call.speaking;
  return (
    <View className="flex-row items-center gap-3 rounded-lg bg-surface-2 p-3">
      <AssistantOrb state={orbStateOf(call)} size={STRIP_ORB} dimmed={!callActive(call)} />
      <View className="min-w-0 flex-1 gap-0.5">
        <MicMeter detection={pref.detection} live={running} muted={call.muted} />
        <Text variant="caption" tone="variant" numberOfLines={2}>
          {captionOf(call, name)}
        </Text>
      </View>
      <HeardDot on={heard} />
    </View>
  );
}

export function CallAudioPageStrip(): ReactNode {
  return <LiveStrip call={useCall()} name={useAssistantName()} />;
}
