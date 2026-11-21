import { storeUnit } from '../../store/host/unit';
import type { PersonStanding } from '../../store/repositories/person-access';

export interface NodeStanding {
  readonly profileId: string;
  readonly standing: PersonStanding;
}

export const DRIVE_NODE_STANDING_UNIT = storeUnit(
  (store, deviceId: string): NodeStanding | null => {
    const profileId = store.computerNodes.personOf(deviceId);
    return profileId === null
      ? null
      : { profileId, standing: store.personAccess.standing(profileId) };
  },
);
