import { useIsFocused } from 'expo-router';
import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useScreen } from '../../../components/screen-context';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { isNative, useIdiom } from '../../../design/platform';
import type { PlannerPerson } from '../data';
import { Composer } from '../item/composer';
import { opensComposer, type ComposerControl } from './quick-add';

export type QuickAddTarget = 'planner' | 'clock';

export interface QuickAddBarProps {
  readonly target: QuickAddTarget;
  readonly hint: string;
  readonly disabled: boolean;
  readonly onOpen: () => void;
}

const LABEL: Readonly<Record<QuickAddTarget, string>> = {
  planner: 'Add to the Planner',
  clock: 'Add an alarm or timer',
};

const OFFLINE_HINT = 'Changes wait for the hub';

const SHORTCUT = 'N';

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function useComposerKey(active: boolean, onOpen: () => void): void {
  const open = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented || !opensComposer(event, isTextEntry(event.target))) return;
    event.preventDefault();
    onOpen();
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    document.addEventListener('keydown', open);
    return (): void => {
      document.removeEventListener('keydown', open);
    };
  }, [active]);
}

function ShortcutKey(): ReactNode {
  return (
    <View className="rounded-xs border border-outline px-1.5 py-0.5">
      <Text variant="caption" tone="variant">
        {SHORTCUT}
      </Text>
    </View>
  );
}

export function QuickAddBar({ target, hint, disabled, onOpen }: QuickAddBarProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const focused = useIsFocused();
  useComposerKey(pointer && focused && !disabled, onOpen);
  const shown = disabled ? OFFLINE_HINT : hint;
  return (
    <Interactive
      role="button"
      label={shown}
      hint={LABEL[target]}
      disabled={disabled}
      onPress={onOpen}
      layerClassName={pointer ? 'rounded-md' : 'rounded-full'}
      className={cn(
        'flex-row items-center gap-2 bg-surface-3',
        pointer ? 'h-control-h rounded-md pl-3 pr-2' : 'h-14 rounded-full px-4',
      )}
    >
      <Icon name="plus" size={pointer ? 16 : 24} tone={disabled ? 'variant' : 'primary'} />
      <Text tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {shown}
      </Text>
      {pointer && !disabled ? <ShortcutKey /> : null}
    </Interactive>
  );
}

export interface QuickAddComposerProps {
  readonly control: ComposerControl;
  readonly target: QuickAddTarget;
  readonly person: PlannerPerson;
  readonly disabled: boolean;
}

export function QuickAddComposer({
  control,
  target,
  person,
  disabled,
}: QuickAddComposerProps): ReactNode {
  const { opening, close } = control;
  return (
    <Composer
      open={opening !== null}
      onClose={close}
      target={target}
      person={person}
      text={opening === null ? '' : opening.text}
      kind={opening === null ? null : opening.kind}
      disabled={disabled}
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
