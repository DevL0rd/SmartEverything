import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar, Rings } from '../../../components/charts';
import { OverflowButton } from '../../../components/menu';
import { Text } from '../../../components/text';
import { WidgetFrame } from '../../../components/widget-board';
import { faceLayoutOf, isTile } from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { Figure } from '../../../components/figure';
import { count, percent } from '../../../format/number';
import { cn } from '../../../design/cn';
import type { ColourRole } from '../../../design/tokens';
import { useTodayContext } from '../data/today';
import { ringsOf, type RingValue } from '../model/today';
import { narrowRowsOf, ringSizeOf } from './rings-size';

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

function RingRow({
  ring,
  narrow = false,
}: {
  readonly ring: RingValue;
  readonly narrow?: boolean;
}): ReactNode {
  const shown = `${amount(ring)} / ${count(ring.goal)}`;
  const label = (
    <View className="min-w-0 flex-row items-center gap-2">
      <View className={cn('size-2.5 rounded-full', DOT[ring.key])} />
      <Text variant="footnote" tone="variant" numberOfLines={1} className="flex-1">
        {ring.label}
      </Text>
    </View>
  );
  return (
    <View className="gap-1">
      {narrow ? (
        <View className="gap-0.5">
          {label}
          <Text variant="footnote" className="tabular" numberOfLines={1}>
            {shown}
          </Text>
        </View>
      ) : (
        <View className="flex-row items-baseline gap-2">
          {label}
          <Text variant="footnote" className="tabular" numberOfLines={1}>
            {shown}
          </Text>
        </View>
      )}
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

const TILE_RING = 100;

const STRIP_RING = 120;

const ROW_RING = 108;

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

function BesideRings({
  rings,
  shown,
  strip,
}: {
  readonly rings: readonly RingValue[];
  readonly shown: readonly ShownRing[];
  readonly strip: boolean;
}): ReactNode {
  const { frame } = useWidgetFace();
  const ring = ringSizeOf(frame, strip ? STRIP_RING : ROW_RING);
  const narrow = narrowRowsOf(frame, ring);
  return (
    <View className="flex-1 flex-row items-center gap-5">
      <Rings rings={shown} size={ring} />
      <View className={cn('min-w-0 flex-1', strip ? 'flex-row gap-6' : 'gap-2')}>
        {rings.map((item) =>
          strip ? (
            <RingColumn key={item.key} ring={item} />
          ) : (
            <RingRow key={item.key} ring={item} narrow={narrow} />
          ),
        )}
      </View>
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
          <Rings rings={shown} size={ringSizeOf(frame, TILE_RING)} />
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
  const { cls } = useWidgetFace();
  const rings = ringsOf(figures, day, goals);
  return (
    <WidgetFrame
      title="Activity"
      icon="activity"
      accent="move"
      href={href.fitnessPage('activity', { day })}
      action={isTile(cls) ? undefined : <GoalsMenu />}
    >
      <RingsBody rings={rings} />
    </WidgetFrame>
  );
}
