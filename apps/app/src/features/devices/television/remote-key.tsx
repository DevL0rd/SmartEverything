import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { TV_KEY_LABELS, TV_KEY_REASON_TEXT, type TvKey } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { KEY_EDGE, KEY_FAILED, KEY_FILL, KEY_FOCUS, KEY_LIT, KEY_LOCKED_FILL } from './key-style';
import { useHoldRepeat, type HoldHandlers } from './use-hold-repeat';
import type { Television } from './use-television';

type KeyLook = 'key' | 'pill' | 'round' | 'play' | 'segment';

const SHAPE: Readonly<Record<KeyLook, string>> = {
  key: 'h-12 w-13 flex-col gap-0.5 rounded-md',
  pill: 'h-12 w-24 flex-row gap-1.5 rounded-full',
  round: 'size-11 rounded-full',
  play: 'size-14 rounded-full',
  segment: 'flex-1 self-stretch',
};

const FACE = cn(KEY_EDGE, KEY_FILL);

const SLOP = 2;

export interface RemoteKeyProps {
  readonly tv: Television;
  readonly name: TvKey;
  readonly icon?: IconName;
  readonly look?: KeyLook;
  readonly text?: string;
  readonly label?: string;
  readonly selected?: boolean;
  readonly emphasis?: boolean;
  readonly onHeld?: () => void;
  readonly run?: () => void;
  readonly lockText?: string | null;
  readonly className?: string;
}

interface KeyState {
  readonly why: string | null;
  readonly spoken: string;
  readonly marked: boolean;
}

function keyState(props: RemoteKeyProps): KeyState {
  const { tv, name, label, lockText } = props;
  const reason = tv.view.locks[name];
  const derived = reason === undefined ? null : TV_KEY_REASON_TEXT[reason];
  const why = lockText === undefined ? derived : lockText;
  return {
    why,
    spoken: label ?? TV_KEY_LABELS[name],
    marked: why !== null && tv.view.mode === 'on',
  };
}

function useKeyHandlers(props: RemoteKeyProps, state: KeyState): HoldHandlers {
  const { tv, name, run, onHeld } = props;
  const fire = (stop: () => void): void => {
    if (state.why !== null && run !== undefined) {
      tv.explain(`${state.spoken}: ${state.why}`);
    } else if (run === undefined) {
      tv.press(name, stop);
    } else {
      run();
    }
  };
  return useHoldRepeat(
    fire,
    () => (state.why === null ? (tv.view.rates[name] ?? null) : null),
    onHeld,
  );
}

function keyStates(props: RemoteKeyProps, state: KeyState): string {
  const { tv, name, selected = false, emphasis = false, look = 'key' } = props;
  const surface = look !== 'segment';
  return cn(
    surface && state.marked && cn('border-dashed', KEY_LOCKED_FILL),
    surface && (selected || emphasis) && KEY_LIT,
    tv.flash === name && KEY_FAILED,
  );
}

function keyClass(props: RemoteKeyProps, state: KeyState): string {
  const { look = 'key', className } = props;
  return cn(
    'items-center justify-center active:scale-95',
    KEY_FOCUS,
    SHAPE[look],
    look !== 'segment' && FACE,
    keyStates(props, state),
    className,
  );
}

function KeyFace({
  icon,
  text,
  look,
  marked,
}: {
  readonly icon: IconName | undefined;
  readonly text: string | undefined;
  readonly look: KeyLook | undefined;
  readonly marked: boolean;
}): ReactNode {
  const tone = marked ? 'variant' : 'default';
  return (
    <>
      {icon === undefined ? null : (
        <Icon name={icon} size={look === 'play' ? 24 : 20} tone={tone} />
      )}
      {text === undefined ? null : (
        <Text variant="caption" tone={tone} numberOfLines={1}>
          {text}
        </Text>
      )}
      {marked ? (
        <View className="absolute right-0.5 top-0.5" pointerEvents="none">
          <Icon name="lockKeyhole" size={16} tone="variant" />
        </View>
      ) : null}
    </>
  );
}

export function RemoteKey(props: RemoteKeyProps): ReactNode {
  const state = keyState(props);
  const handlers = useKeyHandlers(props, state);
  return (
    <Pressable
      {...handlers}
      accessibilityRole="button"
      accessibilityLabel={state.why === null ? state.spoken : `${state.spoken}, ${state.why}`}
      accessibilityState={{ disabled: state.why !== null, selected: props.selected === true }}
      hitSlop={props.look === 'round' ? SLOP : undefined}
      className={keyClass(props, state)}
    >
      <KeyFace icon={props.icon} text={props.text} look={props.look} marked={state.marked} />
    </Pressable>
  );
}
