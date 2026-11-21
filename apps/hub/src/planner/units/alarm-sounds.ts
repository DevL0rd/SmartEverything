import type { PlannerAlarmSound } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { storeUnit } from '../../store/host/unit';
import { AlarmSounds } from '../alarm-sound';

const log = new Logger('hub.planner');

export const PLANNER_ALARM_SOUND_READ_UNITS = {
  plannerAlarmSoundUsable: storeUnit(
    (
      store,
      { profileId, sound }: { readonly profileId: string; readonly sound: PlannerAlarmSound },
    ): void => {
      new AlarmSounds(store, log).assertUsable(profileId, sound);
    },
  ),
} as const;
