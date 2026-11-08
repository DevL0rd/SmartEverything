import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar, Rings } from '../../../components/charts';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { ActionBand, WidgetFrame } from '../../../components/widget-board';
import { faceLayoutOf } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { Figure, type FigureSize } from '../../../components/figure';
import { count, percent } from '../../../format/number';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { useTodayContext } from '../data/today';
import { ringsOf, type RingValue } from '../model/today';
import { ringSizeOf, stripFigureOf, tallRingOf } from './rings-size';

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
    <View className="gap-0.5">
      <View className="flex-row items-baseline gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className={cn('size-2.5 rounded-full', DOT[ring.key])} />
          <Text variant="footnote" tone="variant" numberOfLines={1} className="flex-1">
            {ring.label}
          </Text>
        </View>
        <Text variant="footnote" className="tabular" numberOfLines={1}>
          {`${amount(ring)} / ${count(ring.goal)}`}
        </Text>
      </View>
      <ProgressBar progress={ring.progress} colour={COLOUR[ring.key]} label={ring.label} />
    </View>
  );
}

function RingColumn({
  ring,
  figure,
}: {
  readonly ring: RingValue;
  readonly figure: FigureSize;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <View className="flex-row items-center gap-2">
        <View className={cn('size-2.5 rounded-full', DOT[ring.key])} />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {ring.label}
        </Text>
      </View>
      <View className="flex-row items-baseline gap-1">
        <Figure value={amount(ring)} unit={ring.unit} size={figure} />
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

type ShownRing = Parameters<typeof Rings>[0]['rings'][number];

interface RingsProps {
  readonly rings: readonly RingValue[];
  readonly shown: readonly ShownRing[];
}

function TallRings({ rings, shown }: RingsProps): ReactNode {
  const { frame } = useWidgetFace();
  return (
    <View className="flex-1 justify-between gap-3">
      <View className="items-center gap-2">
        <Rings rings={shown} size={tallRingOf(frame, rings.length)} />
        <Text variant="callout" tone="variant">
          {cheerOf(rings)}
        </Text>
      </View>
      <View className="flex-row gap-4">
        <View className="min-w-0 flex-1 gap-3">
          {rings.map((ring) => (
            <RingRow key={ring.key} ring={ring} />
          ))}
        </View>
        <ActionBand>
          <GoalsMenu />
        </ActionBand>
      </View>
    </View>
  );
}

function BesideRings({ rings, shown, strip }: RingsProps & { readonly strip: boolean }): ReactNode {
  const { frame } = useWidgetFace();
  const figure = stripFigureOf(frame);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <Rings rings={shown} size={ringSizeOf(frame)} />
      <View
        className={cn('min-w-0 flex-1 self-stretch', strip ? 'flex-row gap-6' : 'justify-between')}
      >
        {rings.map((item) =>
          strip ? (
            <RingColumn key={item.key} ring={item} figure={figure} />
          ) : (
            <RingRow key={item.key} ring={item} />
          ),
        )}
      </View>
      <ActionBand>
        <GoalsMenu />
      </ActionBand>
    </View>
  );
}

function RingsBody({ rings }: { readonly rings: readonly RingValue[] }): ReactNode {
  const { cls, frame } = useWidgetFace();
  const shown = rings.map((ring) => ({
    progress: ring.progress,
    colour: COLOUR[ring.key],
    label: ring.label,
  }));
  switch (faceLayoutOf(cls)) {
    case 'tile':
      return (
        <View className="flex-1 items-center justify-center">
          <Rings rings={shown} size={ringSizeOf(frame)} />
        </View>
      );
    case 'tall':
    case 'report':
      return <TallRings rings={rings} shown={shown} />;
    case 'wide':
      return <BesideRings rings={rings} shown={shown} strip />;
    case 'split':
      return <BesideRings rings={rings} shown={shown} strip={false} />;
  }
}

export function RingsWidget(): ReactNode {
  const { figures, day, goals } = useTodayContext();
  const rings = ringsOf(figures, day, goals);
  return (
    <WidgetFrame
      title="Activity"
      icon="activity"
      accent="move"
      href={href.fitnessPage('activity', { day })}
    >
      <RingsBody rings={rings} />
    </WidgetFrame>
  );
}
