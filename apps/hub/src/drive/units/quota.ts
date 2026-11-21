import { storeUnit } from '../../store/host/unit';

export const DRIVE_QUOTA_STATUS_UNIT = storeUnit((store, profileId: string) =>
  store.driveQuotas.status(profileId),
);
