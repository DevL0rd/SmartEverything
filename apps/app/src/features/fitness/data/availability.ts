import type { BoardWidget } from '../../../components/widget-board';
import { useNutritionWidgets } from '../../nutrition';
import { useHasScale } from '../../profiles';
import { useMyWatch } from '../../watches';
import { METRIC_OPTIONS, TREND_OPTIONS, dailySeries } from '../model/metric-choices';
import type { DailyFigure } from '../model/points';
import { shiftDay } from '../../../format/time';
import { useLastNight } from './nights';
import type { HealthPresence } from './presence';
import { useReadiness } from './readiness';
import type { TodayData } from './today';
import { useLatestWorkout } from './workouts';

const WEEK_DAYS = 7;

function recentSteps(figures: readonly DailyFigure[], day: string): boolean {
  const first = shiftDay(day, 1 - WEEK_DAYS);
  return figures.some((figure) => figure.metric === 'steps' && figure.day >= first);
}

function anyDaily(figures: readonly DailyFigure[]): boolean {
  return figures.length > 0;
}

export function useAvailableWidgets(
  data: TodayData,
  presence: HealthPresence,
): ReadonlySet<string> {
  const { night } = useLastNight(data.day);
  const readiness = useReadiness(data);
  const { workout } = useLatestWorkout(data.day);
  const types = presence.types;
  const scale = useHasScale();
  const watch = useMyWatch() !== null;
  const nutrition = useNutritionWidgets(data.day);
  const entries: readonly (readonly [string, boolean])[] = [
    ['rings', presence.domains.has('activity')],
    ['readiness', readiness !== null],
    ['sleep-last-night', night !== null],
    ['heart-today', types.has('HeartRate')],
    ['latest-workout', workout !== null],
    ['body', types.has('Weight') || scale],
    ['metric', anyDaily(data.figures)],
    ['trend', anyDaily(data.figures)],
    ['watch', watch],
    ['stress', watch],
    ['steps-week', recentSteps(data.figures, data.day)],
  ];
  return new Set([...entries.filter(([, shown]) => shown).map(([type]) => type), ...nutrition]);
}

function hasDailyData(figures: readonly DailyFigure[], metric: string, first: string): boolean {
  return figures.some((figure) => figure.metric === metric && figure.day >= first);
}

export function instanceCheck(data: TodayData): (widget: BoardWidget) => boolean {
  return (widget) => {
    if (widget.type === 'metric') {
      const options = METRIC_OPTIONS.safeParse(widget.options);
      return (
        !options.success || hasDailyData(data.figures, dailySeries(options.data.metric).daily, '')
      );
    }
    if (widget.type === 'trend') {
      const options = TREND_OPTIONS.safeParse(widget.options);
      if (!options.success) {
        return true;
      }
      const days = options.data.range === 'week' ? 7 : 30;
      const metric = dailySeries(options.data.metric).daily;
      return hasDailyData(data.figures, metric, shiftDay(data.day, 1 - days));
    }
    return true;
  };
}
