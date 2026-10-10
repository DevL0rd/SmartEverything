import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar, Rings } from '../../../components/charts';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { WidgetFrame, boardClassOf, type WidgetSize } from '../../../components/widget-board';
import { Figure } from '../../../components/figure';
import { useSizeClass } from '../../../design/size-class';
import { count, percent } from '../../../format/number';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { useTodayContext } from '../data/today';
import { ringsOf, type RingValue } from '../model/today';

const COLOUR: Readonly<Record<RingValue['key'], ColourRole>> = {
  move: 'move',
  exercise: 'exercise',
  steps: 'stand',
};

const DOT: Readonly<Record<RingValue['key'], string>> = {
  move: 'bg-move',
  exercise: 'bg-exercise',
  steps: 'bg-stand',
};

function amount(ring: RingValue): string {
  return ring.value === null ? '0' : count(ring.value);
}

function leftText(ring: RingValue): string {
  if (ring.progress >= 1) {
    return 'Goal reached';
  }
  const left = ring.goal - (ring.value ?? 0);
  return `${count(left)} ${ring.unit} to go`;
}

function cheerOf(rings: readonly RingValue[]): string {
  const closed = rings.filter((ring) => ring.progress >= 1).length;
  if (closed === rings.length) {
    return 'All goals reached today';
  }
  const share = rings.reduce((sum, ring) => sum + Math.min(1, ring.progress), 0) / rings.length;
  if (share === 0) {
    return 'A short walk gets you going';
  }
  if (share < 0.34) {
    return 'Off to a start';
  }
  return share < 0.75 ? 'Good progress today' : 'Almost there';
}

function RingRow({ ring }: { readonly ring: RingValue }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline gap-2">
        <View className={cn('size-2.5 rounded-full', DOT[ring.key])} />
        <Text variant="footnote" tone="variant" numberOfLines={1} className="flex-1">
          {ring.label}
        </Text>
        <Text variant="footnote" className="tabular" numberOfLines={1}>
          {`${amount(ring)} / ${count(ring.goal)}`}
        </Text>
      </View>
      <ProgressBar progress={ring.progress} colour={COLOUR[ring.key]} label={ring.label} />
    </View>
  );
}

function RingColumn({ ring }: { readonly ring: RingValue }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <View className="flex-row items-center gap-2">
        <View className={cn('size-2.5 rounded-full', DOT[ring.key])} />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {ring.label}
        </Text>
      </View>
      <View className="flex-row items-baseline gap-1">
        <Figure value={amount(ring)} unit={ring.unit} size="m" />
        <Text variant="footnote" tone="faint" numberOfLines={1}>
          {`/ ${count(ring.goal)}`}
        </Text>
      </View>
      <ProgressBar progress={ring.progress} colour={COLOUR[ring.key]} label={ring.label} thick />
      <Text variant="footnote" tone="faint" numberOfLines={1}>
        {`${percent(Math.min(ring.progress, 9.99))} · ${leftText(ring)}`}
      </Text>
    </View>
  );
}

function GoalsMenu(): ReactNode {
  const router = useRouter();
  return (
    <OverflowButton
      label="Activity options"
      items={[
        {
          label: 'Edit goals',
          icon: 'trophy',
          onPress: (): void => {
            router.push(href.settings.page('health/goals'));
          },
        },
      ]}
    />
  );
}

const TALL_RING = 136;

type ShownRing = Parameters<typeof Rings>[0]['rings'][number];

function TallRings({
  rings,
  shown,
}: {
  readonly rings: readonly RingValue[];
  readonly shown: readonly ShownRing[];
}): ReactNode {
  return (
    <View className="flex-1 justify-between gap-3">
      <View className="items-center gap-2">
        <Rings rings={shown} size={TALL_RING} />
        <Text variant="callout" tone="variant">
          {cheerOf(rings)}
        </Text>
      </View>
      <View className="gap-3">
        {rings.map((ring) => (
          <RingRow key={ring.key} ring={ring} />
        ))}
      </View>
    </View>
  );
}

function RingsBody({
  rings,
  size,
  strip,
}: {
  readonly rings: readonly RingValue[];
  readonly size: WidgetSize;
  readonly strip: boolean;
}): ReactNode {
  const shown = rings.map((ring) => ({
    progress: ring.progress,
    colour: COLOUR[ring.key],
    label: ring.label,
  }));
  if (size === 'S') {
    return (
      <View className="flex-1 items-center justify-center">
        <Rings rings={shown} size={100} />
      </View>
    );
  }
  if (size === 'L' || size === 'XL') {
    return <TallRings rings={rings} shown={shown} />;
  }
  return (
    <View className="flex-1 flex-row items-center gap-5">
      <Rings rings={shown} size={strip ? 120 : 108} />
      <View className={cn('min-w-0 flex-1', strip ? 'flex-row gap-6' : 'gap-2')}>
        {rings.map((ring) =>
          strip ? (
            <RingColumn key={ring.key} ring={ring} />
          ) : (
            <RingRow key={ring.key} ring={ring} />
          ),
        )}
      </View>
    </View>
  );
}

export function RingsWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const { figures, day, goals } = useTodayContext();
  const board = boardClassOf(useSizeClass().width);
  const rings = ringsOf(figures, day, goals);
  return (
    <WidgetFrame
      title="Activity"
      icon="activity"
      accent="move"
      href={href.fitnessPage('activity', { day })}
      action={size === 'S' ? undefined : <GoalsMenu />}
      size={size}
    >
      <RingsBody rings={rings} size={size} strip={size === 'W' && board !== 'compact'} />
    </WidgetFrame>
  );
}
