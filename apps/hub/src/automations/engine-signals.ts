import {
  automationSignalError,
  kindSpecOf,
  type AutomationDefinition,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import type { WatchedTrigger } from '../signals/signal-watchers';

export function watchedTriggers(
  definition: AutomationDefinition,
  sources: readonly SignalSourceSpec[],
): WatchedTrigger[] {
  return definition.triggers.flatMap((trigger) =>
    trigger.type === 'signal'
      ? [{ trigger, pulse: kindSpecOf(sources, trigger)?.pulse === true }]
      : [],
  );
}

export function unknownSignalOf(
  sources: readonly SignalSourceSpec[],
  definition: AutomationDefinition,
): string | null {
  const error = automationSignalError(sources, definition);
  return error === null ? null : `${error.name}: ${error.message}`;
}
