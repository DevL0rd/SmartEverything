import {
  WEATHER_FORECAST,
  WEATHER_METRICS,
  kindSpecOf,
  weatherReading,
  type AutomationV2,
  type JsonValue,
  type SignalInput,
  type SignalSourceSpec,
  type SignalTriggerV2,
  type WeatherForecast,
  type WeatherMetric,
} from '@smarteverything/domain';
import type { WatchedTrigger } from '../signals/signal-watchers';

function isWeatherLevel(trigger: SignalTriggerV2): boolean {
  return trigger.source === 'weather' && trigger.field !== undefined;
}

function signalTriggersOf(automation: AutomationV2): SignalTriggerV2[] {
  return automation.when.flatMap((trigger) => (trigger.on === 'signal' ? [trigger] : []));
}

export function watchedTriggers(
  automation: AutomationV2,
  sources: readonly SignalSourceSpec[],
): WatchedTrigger[] {
  return signalTriggersOf(automation).map((trigger) => ({
    trigger,
    pulse: !isWeatherLevel(trigger) && kindSpecOf(sources, trigger)?.pulse === true,
  }));
}

export function weatherFieldsOf(automations: readonly AutomationV2[]): ReadonlySet<string> {
  return new Set(
    automations.flatMap((automation) =>
      signalTriggersOf(automation).flatMap((trigger) =>
        isWeatherLevel(trigger) && trigger.field !== undefined ? [trigger.field] : [],
      ),
    ),
  );
}

function weatherField(field: string): WeatherMetric | 'kind' | undefined {
  return field === 'kind' ? field : WEATHER_METRICS.find((metric) => metric === field);
}

function forecastOf(value: JsonValue | null): WeatherForecast | null {
  const parsed = WEATHER_FORECAST.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function weatherLevelSignals(
  signal: SignalInput,
  fields: ReadonlySet<string>,
): readonly SignalInput[] {
  if (signal.source !== 'weather' || signal.kind !== 'forecast') return [];
  const next = forecastOf(signal.value);
  const previous = forecastOf(signal.previous);
  if (next === null) return [];
  return [...fields].flatMap((field) => {
    const reading = weatherField(field);
    const value = reading === undefined ? undefined : weatherReading(reading, next);
    if (reading === undefined || value === undefined) return [];
    return [{ ...signal, field, value, previous: weatherReading(reading, previous) ?? null }];
  });
}
