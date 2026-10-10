import { useRooms } from '../../../store/selectors';
import { chartedMetric } from '../data/air-history';
import { useClimateSources } from '../model/climate-devices';
import { comfortOf, INDOOR_METRICS, readingsOf } from '../model/comfort';
import { hasSupplies } from '../model/supplies';
import { useWeather, weatherShown } from '../../weather';

export interface ClimateWidgetState {
  readonly types: ReadonlySet<string>;
  readonly airHistory: boolean;
  readonly supplies: boolean;
}

export function useClimateWidgets(): ClimateWidgetState {
  const sources = useClimateSources(null);
  const comfort = comfortOf(sources, useRooms(), INDOOR_METRICS).length > 0;
  const weather = weatherShown(useWeather());
  const airHistory = chartedMetric(sources) !== null;
  const supplies = sources.some(hasSupplies);
  const entries: readonly (readonly [string, boolean])[] = [
    ['air-quality', readingsOf(sources, ['pm25']).length > 0],
    ['comfort', comfort],
    ['outdoor', weather && comfort],
    ['air-chart', airHistory],
    ['supplies', supplies],
  ];
  return {
    types: new Set(entries.filter(([, shown]) => shown).map(([type]) => type)),
    airHistory,
    supplies,
  };
}
