import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { FillChart } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import {
  WidgetFrame,
  boardClassOf,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { useSizeClass } from '../../../design/size-class';
import { decimal } from '../../../format/number';
import { dayAge, relative, shiftDay } from '../../../format/time';
import { useMinute } from '../../../store/clock';
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

type Layout = 'tile' | 'split' | 'wide' | 'tall' | 'report';

function layoutOf(size: WidgetSize, compact: boolean): Layout {
  switch (size) {
    case 'S':
      return 'tile';
    case 'M':
      return 'split';
    case 'W':
      return compact ? 'split' : 'wide';
    case 'L':
      return 'tall';
    case 'XL':
      return compact ? 'tall' : 'report';
  }
}

function useSourceText(view: BodyView, today: string): string {
  const now = useMinute();
  return view.source.kind === 'scale'
    ? `Scale · ${relative(view.source.at, now)}`
    : `Health Connect · ${dayAge(view.source.day, today)}`;
}

function Headline({ view, big }: { readonly view: BodyView; readonly big: boolean }): ReactNode {
  const day = useContext(DayContext);
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

function Trend({ glance }: { readonly glance: MetricGlance }): ReactNode {
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

function Side({
  view,
  glance,
}: {
  readonly view: BodyView;
  readonly glance: MetricGlance;
}): ReactNode {
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

function Report({
  view,
  glance,
}: {
  readonly view: BodyView;
  readonly glance: MetricGlance;
}): ReactNode {
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-56 justify-between gap-3">
        <Headline view={view} big />
        {view.composition === null ? null : <BodyBadges composition={view.composition} />}
        <QuickStats stats={statsOf(view)} />
      </View>
      <Trend glance={glance} />
      <View className="w-120 justify-center">
        <Chips view={view} report columns={3} />
      </View>
    </View>
  );
}

function Wide({
  view,
  glance,
}: {
  readonly view: BodyView;
  readonly glance: MetricGlance;
}): ReactNode {
  return (
    <View className="flex-1 flex-row gap-6">
      <View className="w-48 justify-center">
        <Headline view={view} big />
      </View>
      <Trend glance={glance} />
      <View className="w-96 justify-center">
        {view.composition === null ? (
          <Side view={view} glance={glance} />
        ) : (
          <Chips view={view} report={false} columns={4} />
        )}
      </View>
    </View>
  );
}

function Tall({
  view,
  glance,
}: {
  readonly view: BodyView;
  readonly glance: MetricGlance;
}): ReactNode {
  return (
    <View className="flex-1 gap-3">
      <View className="flex-row gap-4">
        <View className="min-w-0 flex-1">
          <Headline view={view} big />
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

function Body({
  view,
  glance,
  layout,
}: {
  readonly view: BodyView;
  readonly glance: MetricGlance;
  readonly layout: Layout;
}): ReactNode {
  switch (layout) {
    case 'tile':
      return (
        <View className="flex-1 gap-2">
          <Headline view={view} big={false} />
          <Trend glance={glance} />
        </View>
      );
    case 'split':
      return (
        <View className="flex-1 flex-row gap-4">
          <View className="min-w-0 flex-1 justify-center">
            <Headline view={view} big />
          </View>
          <Side view={view} glance={glance} />
        </View>
      );
    case 'wide':
      return <Wide view={view} glance={glance} />;
    case 'tall':
      return <Tall view={view} glance={glance} />;
    case 'report':
      return <Report view={view} glance={glance} />;
  }
}

const DayContext = createContext('');

function useBodyFigures(): { readonly figures: readonly DailyFigure[]; readonly day: string } {
  const board = useContext(TodayContext);
  const today = useToday();
  const day = board?.day ?? today;
  const own = useDailyRows(shiftDay(day, -DAYS), today);
  return { figures: board?.figures ?? own.figures, day };
}

function BodyContent({ size }: { readonly size: WidgetSize }): ReactNode {
  const { figures, day } = useBodyFigures();
  const compact = boardClassOf(useSizeClass().width) === 'compact';
  const readings = useBodyReadings(useActiveProfile()?.id ?? null);
  const glance = glanceOf(figures, { metric: 'weight', day, days: DAYS, better: 'neither' });
  const view = bodyViewOf(readings, figures, glance, day);
  return (
    <WidgetFrame
      title="Body"
      icon="scale"
      accent="viz-6"
      href={href.fitnessPage('body', { day })}
      size={size}
    >
      {view === null ? (
        <Text variant="callout" tone="variant">
          Step on the scale or log your weight to see it here.
        </Text>
      ) : (
        <DayContext.Provider value={day}>
          <Body view={view} glance={glance} layout={layoutOf(size, compact)} />
        </DayContext.Provider>
      )}
    </WidgetFrame>
  );
}

function BodyWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  if (!useFitnessReady()) {
    return <FitnessSetupWidget title="Body" size={size} />;
  }
  return <BodyContent size={size} />;
}

const SIZES = ['S', 'M', 'W', 'L', 'XL'] as const;

export const BODY_WIDGET: WidgetDefinition = {
  type: 'body',
  title: 'Body',
  icon: 'scale',
  sizes: { compact: SIZES, medium: SIZES, expanded: SIZES },
  defaultSize: 'M',
  render: ({ size }) => <BodyWidget size={size} />,
};
