import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Tooltip } from '../../../components/tooltip';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';
import type { SendMode } from '../model/composer-state';

const GLYPH: Readonly<Record<SendMode, IconName>> = {
  idle: 'arrowUp',
  send: 'arrowUp',
  stop: 'square',
};

const LABEL: Readonly<Record<SendMode, string>> = {
  idle: 'Send',
  send: 'Send',
  stop: 'Stop',
};

const QUARTER_TURN = 90;

function SwapGlyph({ mode }: { readonly mode: SendMode }): ReactNode {
  const { reduced } = useMotion();
  const progress = useSharedValue(1);
  const name = GLYPH[mode];
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
      <Icon name={name} size={20} tone={mode === 'idle' ? 'faint' : 'onPrimary'} />
    </Animated.View>
  );
}

function Disc({
  mode,
  pointer,
}: {
  readonly mode: SendMode;
  readonly pointer: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'items-center justify-center rounded-full',
        pointer ? 'size-8' : 'size-10',
        mode === 'idle' ? 'border border-outline' : 'bg-primary',
      )}
    >
      <SwapGlyph mode={mode} />
    </View>
  );
}

function IdleSend({ pointer }: { readonly pointer: boolean }): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={LABEL.idle}
      accessibilityState={{ disabled: true }}
      className={cn('items-center justify-center', pointer ? 'size-8' : 'size-touch-min')}
    >
      <Disc mode="idle" pointer={pointer} />
    </View>
  );
}

export function SendButton({
  mode,
  onSend,
  onStop,
  shortcut,
}: {
  readonly mode: SendMode;
  readonly onSend: () => void;
  readonly onStop: () => void;
  readonly shortcut: string | null;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [hovered, setHovered] = useState(false);
  const tip = shortcut === null || mode === 'stop' ? LABEL[mode] : `${LABEL[mode]} · ${shortcut}`;
  if (mode === 'idle') {
    return <IdleSend pointer={pointer} />;
  }
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
        label={LABEL[mode]}
        onPress={mode === 'stop' ? onStop : onSend}
        onTone="primary"
        className={cn(
          'items-center justify-center rounded-full',
          pointer ? 'size-8' : 'size-touch-min',
        )}
        layerClassName="rounded-full"
      >
        <Disc mode={mode} pointer={pointer} />
      </Interactive>
      {pointer && hovered ? <Tooltip text={tip} /> : null}
    </View>
  );
}
