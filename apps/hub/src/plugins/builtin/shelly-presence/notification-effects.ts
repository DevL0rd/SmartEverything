import type { ShellyDevice } from '@smarteverything/shelly';
import type { DeviceDriverContext } from '../contract';
import { componentEvent, faultTransition } from './component-events';
import { readingsChanged, type ShellyEvent } from './notifications';
import { projectShellyReadings } from './projector';
import type { ShellyCrossings } from './crossings';
import { inventoryVisibleChange } from './visible-change';

export interface NotificationEffects {
  readonly context: DeviceDriverContext;
  readonly crossings: ShellyCrossings;
  readonly failure: (operation: string, cause: unknown) => void;
  readonly tracksChanged: (sensor: ShellyDevice) => void;
  readonly inventoryChanged: () => void;
}

export function applyNotificationEffects(
  effects: NotificationEffects,
  before: ShellyDevice,
  after: ShellyDevice,
  events: readonly ShellyEvent[],
): void {
  const { context } = effects;
  const faulted = faultTransition(context.sink, before, after);
  for (const event of events) {
    effects.crossings.observe(context.publishEvent, after, event).catch((cause: unknown) => {
      effects.failure('crossing_commit', cause);
    });
    componentEvent(context.sink, after, event);
  }
  if (readingsChanged(before, after)) projectShellyReadings(context.sink, after, before);
  if (before.tracks !== after.tracks || before.tracksAt !== after.tracksAt)
    effects.tracksChanged(after);
  if (faulted || inventoryVisibleChange(before, after)) effects.inventoryChanged();
}
