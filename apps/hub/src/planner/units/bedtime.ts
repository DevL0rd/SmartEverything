import type { PlannerSleepSound, PlannerSleepSource } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { personClockText } from '../../clock/person-clock';
import { storeUnit } from '../../store/host/unit';
import { AlarmSounds } from '../alarm-sound';

const log = new Logger('hub.planner');

export const PLANNER_BEDTIME_READ_UNITS = {
  plannerSleepSource: storeUnit(
    (
      store,
      { profileId, sound }: { readonly profileId: string; readonly sound: PlannerSleepSound },
    ): PlannerSleepSource => new AlarmSounds(store, log).sleepSource(profileId, sound),
  ),
  plannerClockText: storeUnit(
    (store, { profileId, at }: { readonly profileId: string; readonly at: string }): string =>
      personClockText(store, profileId, at, store.settings.read().time_zone),
  ),
} as const;
