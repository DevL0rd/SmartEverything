import { storeUnit } from '../store/host/unit';
import { readDriveUsage, type DriveUsageViewer } from './usage';

export const DRIVE_USAGE_UNIT = storeUnit((store, viewer: DriveUsageViewer) =>
  readDriveUsage(store.driveQuotas, viewer),
);
