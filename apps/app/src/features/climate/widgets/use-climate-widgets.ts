import { chartedMetric } from '../data/air-history';
import { useClimateDerived, type ClimateSource } from '../model/climate-devices';
import { comfortOf, INDOOR_METRICS, readingsOf } from '../model/comfort';
import { hasSupplies } from '../model/supplies';
import { useWeather, weatherShown } from '../../weather';

export interface ClimateWidgetState {
  readonly types: ReadonlySet<string>;
  readonly airHistory: boolean;
  readonly supplies: boolean;
}

interface ClimateShape {
  readonly airQuality: boolean;
  readonly comfort: boolean;
  readonly airHistory: boolean;
  readonly supplies: boolean;
}

function shapeOf(
  sources: readonly ClimateSource[],
  rooms: readonly { readonly id: string; readonly name: string }[],
): ClimateShape {
  return {
    airQuality: readingsOf(sources, ['pm25']).length > 0,
    comfort: comfortOf(sources, rooms, INDOOR_METRICS).length > 0,
    airHistory: chartedMetric(sources.map((source) => source.model)) !== null,
    supplies: sources.some(hasSupplies),
  };
}

function sameShape(left: ClimateShape, right: ClimateShape): boolean {
  return (
    left.airQuality === right.airQuality &&
    left.comfort === right.comfort &&
    left.airHistory === right.airHistory &&
    left.supplies === right.supplies
  );
}

export function useClimateWidgets(): ClimateWidgetState {
  const shape = useClimateDerived(shapeOf, sameShape);
  const weather = weatherShown(useWeather());
  const entries: readonly (readonly [string, boolean])[] = [
    ['air-quality', shape.airQuality],
    ['comfort', shape.comfort],
    ['outdoor', weather && shape.comfort],
    ['air-chart', shape.airHistory],
    ['supplies', shape.supplies],
  ];
  return {
    types: new Set(entries.filter(([, shown]) => shown).map(([type]) => type)),
    airHistory: shape.airHistory,
    supplies: shape.supplies,
  };
}
