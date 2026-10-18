import type { BoardWidget } from '../../../components/widget-board';
import { useNutritionWidgets } from '../../nutrition';
import { useHasScale } from '../../profiles';
import { useMyWatch } from '../../watches';
import { figureOn } from '../model/daily';
import { METRIC_OPTIONS, TREND_OPTIONS, dailySeries } from '../model/metric-choices';
import type { DailyFigure } from '../model/points';
import { shiftDay } from '../../../format/time';
import type { HealthPresence } from './presence';
import type { TodayData } from './today';

const WEEK_DAYS = 7;
const LATEST_WORKOUT_DAYS = 30;

function hasDailyData(figures: readonly DailyFigure[], metric: string, first: string): boolean {
  return figures.some((figure) => figure.metric === metric && figure.day >= first);
}

function hasReadinessData(data: TodayData): boolean {
  return (
    figureOn(data.figures, data.day, 'sleep') !== null ||
    figureOn(data.figures, data.day, 'heart_rate_variability') !== null
  );
}

export function useAvailableWidgets(
  data: TodayData,
  presence: HealthPresence,
): ReadonlySet<string> {
  const { figures, day } = data;
  const types = presence.types;
  const scale = useHasScale();
  const watch = useMyWatch() !== null;
  const nutrition = useNutritionWidgets(day);
  const entries: readonly (readonly [string, boolean])[] = [
    ['rings', presence.domains.has('activity')],
    ['readiness', hasReadinessData(data)],
    ['sleep-last-night', figureOn(figures, day, 'sleep') !== null],
    ['heart-today', types.has('HeartRate')],
    ['latest-workout', hasDailyData(figures, 'exercise', shiftDay(day, 1 - LATEST_WORKOUT_DAYS))],
    ['body', types.has('Weight') || scale],
    ['metric', figures.length > 0],
    ['trend', figures.length > 0],
    ['watch', watch],
    ['stress', watch],
    ['steps-week', hasDailyData(figures, 'steps', shiftDay(day, 1 - WEEK_DAYS))],
  ];
  return new Set([...entries.filter(([, shown]) => shown).map(([type]) => type), ...nutrition]);
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
