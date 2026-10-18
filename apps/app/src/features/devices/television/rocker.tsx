import type { ReactNode } from 'react';
import { Pressable, View, type AccessibilityActionEvent, type ViewProps } from 'react-native';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { isNative } from '../../../design/platform';
import { KEY_EDGE, KEY_FOCUS } from './key-style';
import { RemoteKey } from './remote-key';
import { volumeText } from './state-line';
import type { Television } from './use-television';
import type { TvKey } from '@smarteverything/domain';

export type RockerKind = 'volume' | 'channel';
export type Orientation = 'vertical' | 'horizontal';

interface Pair {
  readonly up: TvKey;
  readonly down: TvKey;
  readonly label: string;
}

const PAIRS: Readonly<Record<RockerKind, Pair>> = {
  volume: { up: 'vol_up', down: 'vol_down', label: 'Volume' },
  channel: { up: 'ch_up', down: 'ch_down', label: 'Channel' },
};

const ADJUST = [
  { name: 'increment', label: 'Up' },
  { name: 'decrement', label: 'Down' },
] as const;

const SEAM_SLOP = 6;

const SEAM_ACTION = { name: 'seam', label: 'Set volume' } as const;

function adjuster(
  tv: Television,
  pair: Pair,
  onSeam: (() => void) | null,
): (event: AccessibilityActionEvent) => void {
  return (event): void => {
    const name = event.nativeEvent.actionName;
    if (name === 'increment') {
      tv.press(pair.up);
    } else if (name === 'decrement') {
      tv.press(pair.down);
    } else if (name === 'seam' && onSeam !== null) {
      onSeam();
    }
  };
}

function seamText(tv: Television, kind: RockerKind): string {
  return kind === 'channel' ? 'CH' : (volumeText(tv.view.volume) ?? '–');
}

function Seam({
  tv,
  kind,
  vertical,
  onPress,
}: {
  readonly tv: Television;
  readonly kind: RockerKind;
  readonly vertical: boolean;
  readonly onPress: (() => void) | null;
}): ReactNode {
  const text = seamText(tv, kind);
  const stale = kind === 'volume' && (tv.view.volume.stale || tv.view.mode !== 'on');
  const shape = cn(
    'items-center justify-center bg-surface-2',
    vertical ? 'h-8 w-full' : 'h-full w-8',
  );
  const label = (
    <Text variant="label" tone={stale ? 'variant' : 'default'} className="tabular">
      {text}
    </Text>
  );
  if (onPress === null) {
    return (
      <View className={shape} pointerEvents="none">
        {label}
      </View>
    );
  }
  return (
    <Pressable
      disabled={tv.view.mode !== 'on'}
      onPress={onPress}
      hitSlop={SEAM_SLOP}
      accessibilityRole="button"
      accessibilityLabel={`${PAIRS[kind].label} ${text}. Set ${PAIRS[kind].label.toLowerCase()}`}
      className={cn(shape, KEY_FOCUS, '-outline-offset-2')}
    >
      {label}
    </Pressable>
  );
}

function iconsOf(kind: RockerKind, vertical: boolean): readonly [IconName, IconName] {
  return vertical && kind === 'channel' ? ['chevronUp', 'chevronDown'] : ['plus', 'minus'];
}

function groupProps(
  tv: Television,
  kind: RockerKind,
  onSeam: (() => void) | null,
): Partial<ViewProps> {
  if (!isNative()) {
    return {};
  }
  return {
    accessible: true,
    accessibilityRole: 'adjustable',
    accessibilityLabel: PAIRS[kind].label,
    accessibilityActions: onSeam === null ? ADJUST : [...ADJUST, SEAM_ACTION],
    onAccessibilityAction: adjuster(tv, PAIRS[kind], onSeam),
    ...(kind === 'volume' ? { accessibilityValue: { text: seamText(tv, kind) } } : {}),
  };
}

const HIDDEN_FROM_READERS: Partial<ViewProps> = {
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
};

export function Rocker({
  tv,
  kind,
  orientation,
  onSeam,
  seamButton = false,
  onHeld,
}: {
  readonly tv: Television;
  readonly kind: RockerKind;
  readonly orientation: Orientation;
  readonly onSeam: (() => void) | null;
  readonly seamButton?: boolean;
  readonly onHeld?: () => void;
}): ReactNode {
  const pair = PAIRS[kind];
  const vertical = orientation === 'vertical';
  const [plus, minus] = iconsOf(kind, vertical);
  const first = vertical ? { name: pair.up, icon: plus } : { name: pair.down, icon: minus };
  const last = vertical ? { name: pair.down, icon: minus } : { name: pair.up, icon: plus };
  const held = onHeld === undefined ? {} : { onHeld };
  return (
    <View
      {...groupProps(tv, kind, onSeam)}
      className={cn(
        'overflow-hidden rounded-full bg-surface-3',
        KEY_EDGE,
        vertical ? 'h-42 w-14' : 'h-12 w-30',
      )}
    >
      <View
        {...(isNative() ? HIDDEN_FROM_READERS : {})}
        className={cn('flex-1', vertical ? 'flex-col' : 'flex-row')}
      >
        <RemoteKey tv={tv} look="segment" {...first} {...held} />
        <Seam tv={tv} kind={kind} vertical={vertical} onPress={seamButton ? onSeam : null} />
        <RemoteKey tv={tv} look="segment" {...last} {...held} />
      </View>
    </View>
  );
}
