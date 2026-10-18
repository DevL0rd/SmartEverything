import { weatherStatusOf, type WeatherForecast, type WeatherRow } from '@smarteverything/domain';
import { useEffect } from 'react';
import { Logger } from '@smarteverything/logging';
import { useMinute } from '../../../store/clock';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';

const log = new Logger('app.weather');

let lastSignature: string | null = null;

export type WeatherView =
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'no_location'; readonly canSet: boolean }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: string }
  | {
      readonly kind: 'ready';
      readonly forecast: WeatherForecast;
      readonly fetchedAt: string;
      readonly stale: boolean;
      readonly problem: string | null;
      readonly airError: string | null;
    };

function useWeatherRow(): WeatherRow | null {
  return useStoreSelector((state) => state.weather);
}

function useWeatherNote(view: WeatherView): void {
  const signature =
    view.kind === 'ready' ? `ready:${String(view.stale)}:${view.problem ?? ''}` : view.kind;
  useEffect(() => {
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    log.info('weather.view_changed', {
      kind: view.kind,
      stale: view.kind === 'ready' ? view.stale : null,
      problem: view.kind === 'ready' ? view.problem : null,
      reason: view.kind === 'failed' ? view.reason : null,
    });
  }, [signature, view]);
}

export function useWeather(): WeatherView {
  const view = useWeatherView();
  useWeatherNote(view);
  return view;
}

function useWeatherView(): WeatherView {
  const row = useWeatherRow();
  const settings = useSettings();
  const owner = useIsOwner();
  const minute = useMinute();
  if (row === null) {
    return { kind: 'unsupported' };
  }
  const status = weatherStatusOf(row, settings, new Date(minute));
  if (status.kind === 'no_location') {
    return { kind: 'no_location', canSet: owner };
  }
  if (status.kind !== 'ready' || row.forecast === null || row.fetched_at === null) {
    return status.kind === 'failed' ? status : { kind: 'loading' };
  }
  return {
    kind: 'ready',
    forecast: row.forecast,
    fetchedAt: row.fetched_at,
    stale: status.stale,
    problem: status.problem,
    airError: row.air_error,
  };
}

export function weatherShown(view: WeatherView): boolean {
  return view.kind !== 'unsupported' && !(view.kind === 'no_location' && !view.canSet);
}
