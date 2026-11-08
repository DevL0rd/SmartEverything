import { background } from '@smarteverything/logging';
import { useState, type ReactNode, type RefObject } from 'react';
import { View, type TextInput } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useScreen } from '../../../components/screen-context';
import { SearchField } from '../../../components/search-field';
import { notify } from '../../../components/toast-store';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useIdiom } from '../../../design/platform';

export type QuickAddTarget = 'planner' | 'clock';

export interface QuickAddBarProps {
  readonly target: QuickAddTarget;
  readonly hint: string;
  readonly onAdd: (text: string) => Promise<boolean>;
  readonly disabled: boolean;
  readonly inputRef?: RefObject<TextInput | null>;
}

const FAILED: Readonly<Record<QuickAddTarget, string>> = {
  planner: 'Couldn’t add that to the Planner',
  clock: 'Couldn’t add that to the Clock',
};

const OFFLINE_HINT = 'Changes wait for the hub';

export function QuickAddBar({
  target,
  hint,
  onAdd,
  disabled,
  inputRef,
}: QuickAddBarProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = (): void => {
    if (disabled || busy) return;
    setBusy(true);
    background(
      onAdd(text)
        .then((added) => {
          if (added) setText('');
        })
        .catch((error: unknown) => {
          notify({ message: FAILED[target], error, tone: 'critical' });
        })
        .finally(() => {
          setBusy(false);
        }),
      'planner.quick_add_failed',
    );
  };
  return (
    <SearchField
      value={text}
      onChange={setText}
      onSubmit={submit}
      placeholder={disabled ? OFFLINE_HINT : hint}
      variant={pointer ? 'field' : 'bar'}
      {...(pointer ? { shortcut: 'N' } : {})}
      {...(inputRef === undefined ? {} : { inputRef })}
    />
  );
}

function directionOf(now: number, before: number, current: number): number {
  'worklet';
  if (now <= 0 || now < before) return 0;
  return now > before ? 1 : current;
}

export function ScrollAwayBar({ children }: { readonly children: ReactNode }): ReactNode {
  const { scrollY } = useScreen();
  const { reduced } = useMotion();
  const away = useSharedValue(0);
  const shown = useSharedValue(1);
  const height = useSharedValue(0);
  useAnimatedReaction(
    () => scrollY.get(),
    (now, before) => {
      if (before === null) return;
      const next = directionOf(now, before, away.get());
      if (next === away.get()) return;
      away.set(next);
      const target = 1 - next;
      shown.set(
        reduced
          ? target
          : withTiming(target, { duration: DURATION.short, easing: EASING.standard }),
      );
    },
    [reduced],
  );
  const style = useAnimatedStyle(() =>
    height.get() === 0
      ? { opacity: shown.get() }
      : { opacity: shown.get(), height: height.get() * shown.get() },
  );
  return (
    <Animated.View style={style} className="overflow-hidden">
      <View
        onLayout={(event) => {
          height.set(event.nativeEvent.layout.height);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}
