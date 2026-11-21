import type { PlannerAlarmSound } from '@smarteverything/domain';
import type { Store } from '../store/store';

export class AlarmSoundCheck {
  constructor(private readonly store: Pick<Store, 'host'>) {}

  assertUsable(profileId: string, sound: PlannerAlarmSound): Promise<void> {
    return this.store.host.read('plannerAlarmSoundUsable', { profileId, sound });
  }
}
