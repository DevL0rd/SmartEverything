import { AUTOMATIONS_V3_MIGRATION } from './automations-v3-data';
import { CAMERA_KEEP_DAYS_MIGRATION } from './camera-keep-days';
import { LAUNDRY_NOTICES_MIGRATION } from './laundry-notices';
import type { Migration } from './migration';
import { OLD_AUTOMATIONS_DROP_MIGRATION } from './old-automations-drop';
import { PORT_WIRES_MIGRATION } from './port-wires';

export const LATEST_MIGRATIONS: readonly Migration[] = [
  AUTOMATIONS_V3_MIGRATION,
  OLD_AUTOMATIONS_DROP_MIGRATION,
  LAUNDRY_NOTICES_MIGRATION,
  PORT_WIRES_MIGRATION,
  CAMERA_KEEP_DAYS_MIGRATION,
];
