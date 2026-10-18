import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { Tooltip } from '../../../components/tooltip';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import type { ComposerClass } from '../model/ai-layout';
import type { SendMode } from '../model/composer-state';

type Look = 'primary' | 'tonal' | 'disabled';

const QUARTER_TURN = 90;

const RING_STROKE = 2;

const RING_OUTSET = 3;

const TOUCH_SLOP = 4;

const GLYPH_TONE: Readonly<Record<Look, Tone>> = {
  primary: 'onPrimary',
  tonal: 'default',
  disabled: 'faint',
};

const DISC: Readonly<Record<Look, string>> = {
  primary: 'bg-primary',
  tonal: 'bg-surface-3',
  disabled: 'bg-surface-3',
};

function SwapGlyph({ name, look }: { readonly name: IconName; readonly look: Look }): ReactNode {
  const { reduced } = useMotion();
  const progress = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      progress.set(1);
      return;
    }
    progress.set(0);
    progress.set(withTiming(1, { duration: DURATION.short, easing: EASING.standard }));
  }, [name, reduced, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ rotate: `${String((1 - progress.get()) * QUARTER_TURN)}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Icon name={name} size={20} tone={GLYPH_TONE[look]} />
    </Animated.View>
  );
}

function UploadRing({
  progress,
  diameter,
}: {
  readonly progress: number;
  readonly diameter: number;
}): ReactNode {
  const colour = useColour('primary');
  const size = diameter + 2 * RING_OUTSET;
  const radius = (size - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;
  return (
    <View pointerEvents="none" className="absolute -inset-0.75 items-center justify-center">
      <Svg width={size} height={size} aria-hidden>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={colour}
          strokeOpacity={0.3}
          strokeWidth={RING_STROKE}
        />
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${String(progress * circumference)} ${String(circumference)}`}
          transform={`rotate(-90 ${String(centre)} ${String(centre)})`}
        />
      </Svg>
    </View>
  );
}

interface RoundProps {
  readonly label: string;
  readonly glyph: IconName;
  readonly look: Look;
  readonly onPress?: () => void;
  readonly tip?: string;
  readonly ring?: number | null;
}

function RoundButton({
  label,
  glyph,
  look,
  onPress,
  tip = label,
  ring = null,
}: RoundProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const diameter = pointer ? 32 : 40;
  return (
    <View
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        label={label}
        onPress={onPress}
        disabled={look === 'disabled'}
        onTone={look === 'primary' ? 'primary' : 'surface'}
        className={cn('items-center justify-center rounded-full', pointer ? 'size-8' : 'size-10')}
        layerClassName="rounded-full"
        hitSlop={TOUCH_SLOP}
      >
        <View
          className={cn(
            'items-center justify-center rounded-full',
            pointer ? 'size-8' : 'size-10',
            DISC[look],
          )}
        >
          <SwapGlyph name={glyph} look={look} />
        </View>
      </Interactive>
      {ring === null ? null : <UploadRing progress={ring} diameter={diameter} />}
      {pointer && hovered ? <Tooltip text={tip} placement="above" /> : null}
    </View>
  );
}

type Verb = 'Queue' | 'Steer';

function QueuePill({
  verb,
  onPress,
  tip,
}: {
  readonly verb: Verb;
  readonly onPress: () => void;
  readonly tip: string;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  return (
    <View
      className="relative"
      onPointerEnter={() => {
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
    >
      <Interactive
        label={`${verb} message`}
        onPress={onPress}
        onTone="primary"
        className="justify-center"
        layerClassName="rounded-full"
        hitSlop={TOUCH_SLOP}
      >
        <View
          className={cn(
            'flex-row items-center gap-1.5 rounded-full bg-primary px-3',
            pointer ? 'h-8' : 'h-10',
          )}
        >
          <Icon name="arrowUp" size={pointer ? 16 : 20} tone="onPrimary" />
          <Text variant="label" tone="onPrimary">
            {verb}
          </Text>
        </View>
      </Interactive>
      {pointer && hovered ? <Tooltip text={tip} placement="above" /> : null}
    </View>
  );
}

export interface SendControlsProps {
  readonly mode: SendMode;
  readonly composerClass: ComposerClass;
  readonly ring: number;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly shortcut: string | null;
}

function withShortcut(label: string, shortcut: string | null): string {
  return shortcut === null ? label : `${label} · ${shortcut}`;
}

function QueueControls({
  verb,
  composerClass,
  onSend,
  onStop,
  shortcut,
}: Omit<SendControlsProps, 'mode' | 'ring'> & { readonly verb: Verb }): ReactNode {
  const tip = withShortcut(verb, shortcut);
  return (
    <View className="flex-row items-center gap-1">
      <RoundButton label="Stop reply" glyph="square" look="tonal" onPress={onStop} />
      {composerClass === 'tight' ? (
        <RoundButton
          label={`${verb} message`}
          glyph="arrowUp"
          look="primary"
          onPress={onSend}
          tip={tip}
        />
      ) : (
        <QueuePill verb={verb} onPress={onSend} tip={tip} />
      )}
    </View>
  );
}

export function SendControls(props: SendControlsProps): ReactNode {
  const { mode, ring, onSend, onStop, shortcut } = props;
  if (mode === 'stop') {
    return <RoundButton label="Stop reply" glyph="square" look="tonal" onPress={onStop} />;
  }
  if (mode === 'queue' || mode === 'steer') {
    return <QueueControls {...props} verb={mode === 'steer' ? 'Steer' : 'Queue'} />;
  }
  if (mode === 'idle' || mode === 'blocked') {
    return <RoundButton label="Send message" glyph="arrowUp" look="disabled" />;
  }
  return (
    <RoundButton
      label="Send message"
      glyph="arrowUp"
      look="primary"
      onPress={onSend}
      tip={withShortcut('Send', shortcut)}
      ring={mode === 'uploading' ? ring : null}
    />
  );
}
