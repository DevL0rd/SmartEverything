import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Glow } from '../../../components/glow';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { CHAT_SURFACE } from '../components/chat-surface';
import type { ParticipantInk } from '../model/participant';
import type { ClipSpeed } from './played-clips';
import type { PillView } from './voice-pill-model';

const HIT = 6;
const GLOW_REST = 0.8;
const GLOW_REACH = 0.4;

const GHOST: Readonly<Record<ParticipantInk, string>> = {
  primary: 'bg-primary/18',
  'viz-1': 'bg-viz-1/18',
  'viz-2': 'bg-viz-2/18',
  'viz-3': 'bg-viz-3/18',
  'viz-5': 'bg-viz-5/18',
  'viz-6': 'bg-viz-6/18',
};

export interface PlayControl {
  readonly view: PillView;
  readonly ink: ParticipantInk | null;
  readonly level: SharedValue<number>;
  readonly toggle: () => void;
}

function PlayGlow({ level }: { readonly level: SharedValue<number> }): ReactNode {
  const breathe = useAnimatedStyle(() => ({
    opacity: level.get(),
    transform: [{ scale: GLOW_REST + GLOW_REACH * level.get() }],
  }));
  return (
    <Animated.View pointerEvents="none" style={breathe} className="absolute -inset-2 rounded-full">
      <Glow colour="primary" y="50%" radius="50%" strength={0.45} />
    </Animated.View>
  );
}

function LoadingGlyph({ ink }: { readonly ink: ParticipantInk | null }): ReactNode {
  const tint = useColour(ink ?? 'primary');
  return (
    <View
      className={cn('size-8 items-center justify-center rounded-full', GHOST[ink ?? 'primary'])}
    >
      <ActivityIndicator size="small" color={tint} accessibilityLabel="Loading voice message" />
    </View>
  );
}

function FailedGlyph(): ReactNode {
  return (
    <View aria-hidden className="size-8 items-center justify-center rounded-full bg-critical/16">
      <Icon name="alert" size={16} colour="critical" />
    </View>
  );
}

export function PlayButton({ view, ink, level, toggle }: PlayControl): ReactNode {
  if (view.phase === 'loading') return <LoadingGlyph ink={ink} />;
  if (view.phase === 'failed') return <FailedGlyph />;
  return (
    <View className="relative size-8">
      {view.playing ? <PlayGlow level={level} /> : null}
      <Interactive
        label={view.playing ? 'Pause voice message' : 'Play voice message'}
        hitSlop={HIT}
        onPress={toggle}
        className={cn(
          'size-8 items-center justify-center rounded-full',
          ink === null ? 'bg-primary' : GHOST[ink],
        )}
        layerClassName="rounded-full"
        onTone={ink === null ? 'primary' : 'surface'}
      >
        <Icon name={view.playing ? 'pause' : 'play'} size={16} colour={ink ?? 'on-primary'} />
      </Interactive>
    </View>
  );
}

function SpeedChip({
  speed,
  mine,
  onPress,
}: {
  readonly speed: ClipSpeed;
  readonly mine: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`Playback speed ${String(speed)} times`}
      hitSlop={HIT}
      onPress={onPress}
      className={cn('rounded-sm px-1.25 py-0.5', mine ? 'bg-primary/14' : 'bg-surface-2')}
      layerClassName="rounded-sm"
    >
      <Text
        variant="caption"
        tone={mine ? 'primary' : 'variant'}
        className="tabular font-sans-semibold"
      >
        {`${String(speed)}×`}
      </Text>
    </Interactive>
  );
}

export interface PillTrailProps {
  readonly view: PillView;
  readonly mine: boolean;
  readonly speed: ClipSpeed;
  readonly cycleSpeed: () => void;
  readonly retry: () => void;
}

export function PillTrail({ view, mine, speed, cycleSpeed, retry }: PillTrailProps): ReactNode {
  if (view.phase === 'failed') {
    return (
      <Interactive
        label="Retry voice message"
        hitSlop={HIT}
        onPress={retry}
        layerClassName="rounded-sm"
      >
        <Text variant="footnote" tone="primary" accessibilityLiveRegion="polite">
          Retry
        </Text>
      </Interactive>
    );
  }
  return (
    <>
      {view.time === null ? null : (
        <Text
          variant="caption"
          tone={view.phase === 'loading' ? 'faint' : 'variant'}
          className="tabular min-w-7.5"
        >
          {view.time}
        </Text>
      )}
      {view.speed ? <SpeedChip speed={speed} mine={mine} onPress={cycleSpeed} /> : null}
      {view.unplayed ? (
        <View
          accessibilityLabel="Not played"
          className="-ml-1.5 size-1.5 rounded-full bg-primary"
        />
      ) : null}
    </>
  );
}

export function pillFrame(mine: boolean): string {
  return mine
    ? 'h-10 w-75 max-w-full flex-row items-center gap-2.5 pr-0.5'
    : cn(
        CHAT_SURFACE,
        'h-11 w-75 max-w-full flex-row items-center gap-2.5 rounded-full pl-1.5 pr-2.5',
      );
}
