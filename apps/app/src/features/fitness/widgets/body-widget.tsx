import type { ReactNode } from 'react';
import { useContext } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { WidgetFrame, type WidgetDefinition } from '../../../components/widget-board';
import {
  faceLayoutOf,
  type FaceLayout,
  allSizes,
} from '../../../components/widget-board/all-sizes';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { decimal } from '../../../format/number';
import { dayAge, relative, shiftDay } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useActiveProfile, useBodyReadings } from '../../../store/people';
import { FitnessSetupWidget, useFitnessReady } from '../../profiles';
import { BASIC_CHIPS, BodyBadges, CompositionChips, REPORT_CHIPS } from '../components/body-parts';
import { DeltaLine, QuickStats, type QuickStat } from '../components/glance-parts';
import { useToday } from '../data/day';
import { useDailyRows } from '../data/queries';
import { TodayContext } from '../data/today';
import type { DailyFigure } from '../model/points';
import { bodyViewOf, type BodyView } from '../model/body';
import { freshnessOf } from '../model/freshness';
import { glanceOf, type MetricGlance } from '../model/glance';

const DAYS = 30;

function useSourceText(view: BodyView, today: string): string {
  const source = view.source;
  const age = useMinuteOf((now) => (source.kind === 'scale' ? relative(source.at, now) : ''));
  return source.kind === 'scale'
    ? `Scale · ${age}`
    : `Health Connect · ${dayAge(source.day, today)}`;
}

function Headline({
  view,
  day,
  big,
}: {
  readonly view: BodyView;
  readonly day: string;
  readonly big: boolean;
}): ReactNode {
  const source = useSourceText(view, day);
  return (
    <View className="gap-1">
      <Figure
        value={decimal(view.weight, 1)}
        unit="kg"
        size={big ? 'l' : 'm'}
        stale={freshnessOf(view.day, day).stale}
      />
      {view.delta === null ? null : (
        <DeltaLine delta={view.delta} digits={1} unit="kg" against={view.against} />
      )}
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {source}
      </Text>
    </View>
  );
}

function statsOf(view: BodyView): readonly QuickStat[] {
  const fat = view.composition?.body_fat_percent ?? null;
  const muscle = view.composition?.muscle_mass_kg ?? null;
  return [
    ...(fat === null ? [] : [{ label: 'Body fat', value: `${decimal(fat, 1)} %` }]),
    ...(view.bmi === null ? [] : [{ label: 'BMI', value: decimal(view.bmi, 1) }]),
    ...(muscle === null ? [] : [{ label: 'Muscle', value: `${decimal(muscle, 1)} kg` }]),
  ];
}

interface Shown {
  readonly view: BodyView;
  readonly glance: MetricGlance;
  readonly day: string;
}

function Trend({ glance }: Pick<Shown, 'glance'>): ReactNode {
  return (
    <FillChart
      values={glance.values}
      kind="line"
      colour="viz-6"
      reference={glance.average}
      label="Weight, last 30 days"
    />
  );
}

function Side({ view, glance }: Pick<Shown, 'view' | 'glance'>): ReactNode {
  const stats = statsOf(view);
  return stats.length === 0 ? (
    <Trend glance={glance} />
  ) : (
    <View className="min-w-0 flex-1 justify-center">
      <QuickStats stats={stats} vertical />
    </View>
  );
}

function Chips({
  view,
  report,
  columns,
}: {
  readonly view: BodyView;
  readonly report: boolean;
  readonly columns: number;
}): ReactNode {
  return view.composition === null ? null : (
    <CompositionChips
      composition={view.composition}
      keys={report ? REPORT_CHIPS : BASIC_CHIPS}
      columns={columns}
    />
  );
}

function Report(shown: Shown): ReactNode {
  const { view, glance } = shown;
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-1/4 justify-between gap-3">
        <Headline {...shown} big />
        {view.composition === null ? null : <BodyBadges composition={view.composition} />}
        <QuickStats stats={statsOf(view)} />
      </View>
      <Trend glance={glance} />
      <View className="w-2/5 justify-center">
        <Chips view={view} report columns={3} />
      </View>
    </View>
  );
}

function Wide(shown: Shown): ReactNode {
  const { view, glance } = shown;
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-1/4 justify-center">
        <Headline {...shown} big />
      </View>
      <Trend glance={glance} />
      <View className="w-1/3 justify-center">
        {view.composition === null ? (
          <Side view={view} glance={glance} />
        ) : (
          <Chips view={view} report={false} columns={4} />
        )}
      </View>
    </View>
  );
}

function Tall(shown: Shown): ReactNode {
  const { view, glance } = shown;
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row gap-4">
        <View className="min-w-0 flex-1">
          <Headline {...shown} big />
        </View>
        <View className="min-w-0 flex-1 justify-center">
          <QuickStats stats={statsOf(view)} vertical />
        </View>
      </View>
      <Trend glance={glance} />
      <Chips view={view} report={false} columns={2} />
    </View>
  );
}

function Split(shown: Shown): ReactNode {
  return (
    <View className="flex-1 flex-row gap-4">
      <View className="min-w-0 shrink justify-center">
        <Headline {...shown} big />
      </View>
      <Side view={shown.view} glance={shown.glance} />
    </View>
  );
}

function Tile(shown: Shown): ReactNode {
  return (
    <View className="flex-1 gap-2">
      <Headline {...shown} big={false} />
      <Trend glance={shown.glance} />
    </View>
  );
}

const FACES: Readonly<Record<FaceLayout, (shown: Shown) => ReactNode>> = {
  tile: Tile,
  split: Split,
  wide: Wide,
  tall: Tall,
  report: Report,
};

function useBodyFigures(): { readonly figures: readonly DailyFigure[]; readonly day: string } {
  const board = useContext(TodayContext);
  const today = useToday();
  const day = board?.day ?? today;
  const own = useDailyRows(shiftDay(day, -DAYS), today);
  return { figures: board?.figures ?? own.figures, day };
}

function BodyContent(): ReactNode {
  const { figures, day } = useBodyFigures();
  const { cls } = useWidgetFace();
  const readings = useBodyReadings(useActiveProfile()?.id ?? null);
  const glance = glanceOf(figures, { metric: 'weight', day, days: DAYS, better: 'neither' });
  const view = bodyViewOf(readings, figures, glance, day);
  const Face = FACES[faceLayoutOf(cls)];
  return (
    <WidgetFrame title="Body" icon="scale" accent="viz-6" href={href.fitnessPage('body', { day })}>
      {view === null ? (
        <Text variant="callout" tone="variant">
          Step on the scale or log your weight to see it here.
        </Text>
      ) : (
        <Face view={view} glance={glance} day={day} />
      )}
    </WidgetFrame>
  );
}

function BodyWidget(): ReactNode {
  if (!useFitnessReady()) {
    return <FitnessSetupWidget title="Body" />;
  }
  return <BodyContent />;
}

export const BODY_WIDGET: WidgetDefinition = {
  type: 'body',
  title: 'Body',
  icon: 'scale',
  sizes: allSizes('M', 'W', 'XL'),
  defaultSize: 'M',
  render: () => <BodyWidget />,
};
