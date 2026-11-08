import type { ReactNode } from 'react';
import type {
  BoardDefaults,
  WidgetDefinition,
  WidgetRenderProps,
} from '../../components/widget-board';
import { allSizes } from '../../components/widget-board/all-sizes';
import { Text } from '../../components/text';
import { nutritionWidgets } from '../nutrition';
import { STRESS_WIDGET, WATCH_WIDGET, WATCH_WORKOUT_WIDGET } from '../watches';
import { useTodayContext } from './data/today';
import { dailySeries, METRIC_OPTIONS, TREND_OPTIONS } from './model/metric-choices';
import { BODY_WIDGET } from './widgets/body-widget';
import { HeartWidget } from './widgets/heart-widget';
import { MetricWidget } from './widgets/metric-widget';
import { MetricEditor, TrendEditor } from './widgets/options-editors';
import { ReadinessWidget } from './widgets/readiness-widget';
import { RingsWidget } from './widgets/rings-widget';
import { SleepWidget } from './widgets/sleep-widget';
import { TrendWidget } from './widgets/trend-widget';
import { WorkoutWidget } from './widgets/workout-widget';

export const FITNESS_PAGE = 'fitness';

function InvalidOptions(): ReactNode {
  return (
    <Text variant="callout" tone="warning">
      Choose a metric for this widget
    </Text>
  );
}

function renderMetric({ options }: WidgetRenderProps): ReactNode {
  const parsed = METRIC_OPTIONS.safeParse(options);
  return parsed.success ? (
    <MetricWidget spec={dailySeries(parsed.data.metric)} />
  ) : (
    <InvalidOptions />
  );
}

function renderTrend({ options }: WidgetRenderProps): ReactNode {
  const parsed = TREND_OPTIONS.safeParse(options);
  return parsed.success ? (
    <TrendWidget
      spec={dailySeries(parsed.data.metric)}
      days={parsed.data.range === 'week' ? 7 : 30}
    />
  ) : (
    <InvalidOptions />
  );
}

function useBoardDay(): { readonly day: string; readonly today: string } {
  const { day, today } = useTodayContext();
  return { day, today };
}

export const FITNESS_WIDGETS: readonly WidgetDefinition[] = [
  BODY_WIDGET,
  WATCH_WIDGET,
  STRESS_WIDGET,
  WATCH_WORKOUT_WIDGET,
  ...nutritionWidgets(useBoardDay),
  {
    type: 'rings',
    title: 'Activity rings',
    icon: 'activity',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'W',
    render: () => <RingsWidget />,
  },
  {
    type: 'readiness',
    title: 'Readiness',
    icon: 'gauge',
    sizes: allSizes('M'),
    defaultSize: 'M',
    render: () => <ReadinessWidget />,
  },
  {
    type: 'sleep-last-night',
    title: 'Last night’s sleep',
    icon: 'moon',
    sizes: allSizes('M', 'W'),
    defaultSize: 'M',
    render: () => <SleepWidget />,
  },
  {
    type: 'heart-today',
    title: 'Heart rate',
    icon: 'heartPulse',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: () => <HeartWidget />,
  },
  {
    type: 'latest-workout',
    title: 'Latest workout',
    icon: 'dumbbell',
    sizes: allSizes('M', 'W'),
    defaultSize: 'M',
    render: () => <WorkoutWidget />,
  },
  {
    type: 'metric',
    title: 'Metric',
    icon: 'activity',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    instanceOptions: {
      schema: METRIC_OPTIONS,
      editor: ({ value, onChange }) => (
        <MetricEditor value={METRIC_OPTIONS.parse(value)} onChange={onChange} />
      ),
    },
    render: renderMetric,
  },
  {
    type: 'trend',
    title: 'Trend',
    icon: 'trendUp',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'XL',
    instanceOptions: {
      schema: TREND_OPTIONS,
      editor: ({ value, onChange }) => (
        <TrendEditor value={TREND_OPTIONS.parse(value)} onChange={onChange} />
      ),
    },
    render: renderTrend,
  },
  {
    type: 'steps-week',
    title: 'Steps this week',
    icon: 'footprints',
    sizes: allSizes('M', 'W', 'XL'),
    defaultSize: 'M',
    render: () => <TrendWidget spec={dailySeries('steps')} days={7} />,
  },
];

const DISTANCE = { metric: 'distance' };
const OXYGEN = { metric: 'oxygen_saturation' };
const MOVE_TREND = { metric: 'active_energy', range: 'month' };

export const FITNESS_DEFAULTS: BoardDefaults = {
  compact: [
    { key: 'rings', type: 'rings', size: 'W' },
    { key: 'calories', type: 'calories', size: 'W' },
    { key: 'readiness', type: 'readiness', size: 'M' },
    { key: 'hydration', type: 'hydration', size: 'M' },
    { key: 'sleep', type: 'sleep-last-night', size: 'M' },
    { key: 'heart', type: 'heart-today', size: 'M' },
    { key: 'workout', type: 'latest-workout', size: 'W' },
    { key: 'body', type: 'body', size: 'M' },
    { key: 'watch', type: 'watch', size: 'M' },
    { key: 'metric:distance', type: 'metric', size: 'M', options: DISTANCE },
    { key: 'metric:oxygen', type: 'metric', size: 'M', options: OXYGEN },
    { key: 'steps-week', type: 'steps-week', size: 'M' },
    { key: 'trend:move', type: 'trend', size: 'XL', options: MOVE_TREND },
  ],
  medium: [
    { key: 'rings', type: 'rings', size: 'W' },
    { key: 'calories', type: 'calories', size: 'M' },
    { key: 'macros', type: 'macros', size: 'M' },
    { key: 'sleep', type: 'sleep-last-night', size: 'M' },
    { key: 'heart', type: 'heart-today', size: 'M' },
    { key: 'readiness', type: 'readiness', size: 'M' },
    { key: 'hydration', type: 'hydration', size: 'M' },
    { key: 'metric:distance', type: 'metric', size: 'M', options: DISTANCE },
    { key: 'metric:oxygen', type: 'metric', size: 'M', options: OXYGEN },
    { key: 'workout', type: 'latest-workout', size: 'M' },
    { key: 'body', type: 'body', size: 'M' },
    { key: 'watch', type: 'watch', size: 'M' },
    { key: 'steps-week', type: 'steps-week', size: 'W' },
    { key: 'trend:move', type: 'trend', size: 'W', options: MOVE_TREND },
  ],
  expanded: [
    { key: 'rings', type: 'rings', size: 'W' },
    { key: 'calories', type: 'calories', size: 'M' },
    { key: 'macros', type: 'macros', size: 'M' },
    { key: 'heart', type: 'heart-today', size: 'M' },
    { key: 'sleep', type: 'sleep-last-night', size: 'M' },
    { key: 'readiness', type: 'readiness', size: 'M' },
    { key: 'metric:distance', type: 'metric', size: 'M', options: DISTANCE },
    { key: 'metric:oxygen', type: 'metric', size: 'M', options: OXYGEN },
    { key: 'hydration', type: 'hydration', size: 'M' },
    { key: 'workout', type: 'latest-workout', size: 'M' },
    { key: 'body', type: 'body', size: 'M' },
    { key: 'watch', type: 'watch', size: 'W' },
    { key: 'steps-week', type: 'steps-week', size: 'XL' },
    { key: 'trend:move', type: 'trend', size: 'XL', options: MOVE_TREND },
  ],
};
