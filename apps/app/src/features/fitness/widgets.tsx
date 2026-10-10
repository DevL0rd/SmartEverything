import type { ReactNode } from 'react';
import type {
  BoardClass,
  BoardDefaults,
  WidgetDefinition,
  WidgetRenderProps,
  WidgetSize,
} from '../../components/widget-board';
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

function sizes(
  ...allowed: readonly WidgetSize[]
): Readonly<Record<BoardClass, readonly WidgetSize[]>> {
  return { compact: allowed, medium: allowed, expanded: allowed };
}

function InvalidOptions(): ReactNode {
  return (
    <Text variant="callout" tone="warning">
      Choose a metric for this widget
    </Text>
  );
}

function renderMetric({ size, options }: WidgetRenderProps): ReactNode {
  const parsed = METRIC_OPTIONS.safeParse(options);
  return parsed.success ? (
    <MetricWidget spec={dailySeries(parsed.data.metric)} size={size} />
  ) : (
    <InvalidOptions />
  );
}

function renderTrend({ size, options }: WidgetRenderProps): ReactNode {
  const parsed = TREND_OPTIONS.safeParse(options);
  return parsed.success ? (
    <TrendWidget
      spec={dailySeries(parsed.data.metric)}
      days={parsed.data.range === 'week' ? 7 : 30}
      size={size}
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
    sizes: sizes('S', 'M', 'W', 'L'),
    defaultSize: 'W',
    render: ({ size }) => <RingsWidget size={size} />,
  },
  {
    type: 'readiness',
    title: 'Readiness',
    icon: 'gauge',
    sizes: sizes('S', 'M'),
    defaultSize: 'S',
    render: ({ size }) => <ReadinessWidget size={size} />,
  },
  {
    type: 'sleep-last-night',
    title: 'Last night’s sleep',
    icon: 'moon',
    sizes: sizes('S', 'M', 'W'),
    defaultSize: 'M',
    render: ({ size }) => <SleepWidget size={size} />,
  },
  {
    type: 'heart-today',
    title: 'Heart rate',
    icon: 'heartPulse',
    sizes: sizes('S', 'M', 'W', 'L'),
    defaultSize: 'M',
    render: ({ size }) => <HeartWidget size={size} />,
  },
  {
    type: 'latest-workout',
    title: 'Latest workout',
    icon: 'dumbbell',
    sizes: sizes('M', 'W'),
    defaultSize: 'M',
    render: ({ size }) => <WorkoutWidget size={size} />,
  },
  {
    type: 'metric',
    title: 'Metric',
    icon: 'activity',
    sizes: sizes('S', 'M', 'W', 'L'),
    defaultSize: 'S',
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
    sizes: sizes('M', 'L', 'W'),
    defaultSize: 'L',
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
    sizes: sizes('M', 'L', 'W'),
    defaultSize: 'M',
    render: ({ size }) => <TrendWidget spec={dailySeries('steps')} days={7} size={size} />,
  },
];

const DISTANCE = { metric: 'distance' };
const OXYGEN = { metric: 'oxygen_saturation' };
const MOVE_TREND = { metric: 'active_energy', range: 'month' };

export const FITNESS_DEFAULTS: BoardDefaults = {
  compact: [
    { key: 'rings', type: 'rings', size: 'W' },
    { key: 'calories', type: 'calories', size: 'W' },
    { key: 'readiness', type: 'readiness', size: 'S' },
    { key: 'hydration', type: 'hydration', size: 'S' },
    { key: 'sleep', type: 'sleep-last-night', size: 'M' },
    { key: 'heart', type: 'heart-today', size: 'M' },
    { key: 'workout', type: 'latest-workout', size: 'W' },
    { key: 'body', type: 'body', size: 'M' },
    { key: 'watch', type: 'watch', size: 'M' },
    { key: 'metric:distance', type: 'metric', size: 'S', options: DISTANCE },
    { key: 'metric:oxygen', type: 'metric', size: 'S', options: OXYGEN },
    { key: 'steps-week', type: 'steps-week', size: 'M' },
    { key: 'trend:move', type: 'trend', size: 'L', options: MOVE_TREND },
  ],
  medium: [
    { key: 'rings', type: 'rings', size: 'W' },
    { key: 'calories', type: 'calories', size: 'M' },
    { key: 'macros', type: 'macros', size: 'M' },
    { key: 'sleep', type: 'sleep-last-night', size: 'M' },
    { key: 'heart', type: 'heart-today', size: 'M' },
    { key: 'readiness', type: 'readiness', size: 'S' },
    { key: 'hydration', type: 'hydration', size: 'S' },
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
    { key: 'readiness', type: 'readiness', size: 'S' },
    { key: 'metric:distance', type: 'metric', size: 'S', options: DISTANCE },
    { key: 'metric:oxygen', type: 'metric', size: 'S', options: OXYGEN },
    { key: 'hydration', type: 'hydration', size: 'S' },
    { key: 'workout', type: 'latest-workout', size: 'M' },
    { key: 'body', type: 'body', size: 'M' },
    { key: 'watch', type: 'watch', size: 'W' },
    { key: 'steps-week', type: 'steps-week', size: 'L' },
    { key: 'trend:move', type: 'trend', size: 'L', options: MOVE_TREND },
  ],
};
