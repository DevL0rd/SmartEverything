import { DEVICE_LOG_UNIT } from '../../devices/device-log/read';
import { PHOTO_MERGE_SUGGESTIONS_UNIT } from '../../photos/people/units';
import { SNAPSHOT_TABLES_UNIT } from '../../server/snapshot-tables';
import { DEVICES_READ_UNITS, DEVICES_WRITE_UNITS } from './registry-devices';
import { PHOTOS_READ_UNITS, PHOTOS_WRITE_UNITS } from './registry-photos';
import { SERVER_READ_UNITS, SERVER_WRITE_UNITS } from './registry-server';
import { ASSISTANT_READ_UNITS, ASSISTANT_WRITE_UNITS } from './registry-assistant';
import { DRIVE_READ_UNITS, DRIVE_WRITE_UNITS } from './registry-drive';
import { DRIVE_SHARING_READ_UNITS, DRIVE_SHARING_WRITE_UNITS } from './registry-drive-sharing';
import { LOCAL_READ_UNITS, LOCAL_WRITE_UNITS } from './registry-local';
import { PLANNER_READ_UNITS, PLANNER_WRITE_UNITS } from './registry-planner';
import { SYSTEM_READ_UNITS, SYSTEM_WRITE_UNITS } from './registry-system';
import {
  AUTOMATION_PROGRAM_READ_UNITS,
  AUTOMATION_PROGRAM_WRITE_UNITS,
} from './registry-automation-programs';

export const READ_UNITS = {
  deviceLog: DEVICE_LOG_UNIT,
  photoMergeSuggestions: PHOTO_MERGE_SUGGESTIONS_UNIT,
  snapshotTables: SNAPSHOT_TABLES_UNIT,
  ...DEVICES_READ_UNITS,
  ...PHOTOS_READ_UNITS,
  ...SERVER_READ_UNITS,
  ...ASSISTANT_READ_UNITS,
  ...DRIVE_READ_UNITS,
  ...DRIVE_SHARING_READ_UNITS,
  ...LOCAL_READ_UNITS,
  ...PLANNER_READ_UNITS,
  ...SYSTEM_READ_UNITS,
  ...AUTOMATION_PROGRAM_READ_UNITS,
} as const;

export const WRITE_UNITS = {
  ...DEVICES_WRITE_UNITS,
  ...PHOTOS_WRITE_UNITS,
  ...SERVER_WRITE_UNITS,
  ...ASSISTANT_WRITE_UNITS,
  ...DRIVE_WRITE_UNITS,
  ...DRIVE_SHARING_WRITE_UNITS,
  ...LOCAL_WRITE_UNITS,
  ...PLANNER_WRITE_UNITS,
  ...SYSTEM_WRITE_UNITS,
  ...AUTOMATION_PROGRAM_WRITE_UNITS,
} as const;

export type ReadUnits = typeof READ_UNITS;

export type WriteUnits = typeof WRITE_UNITS;
