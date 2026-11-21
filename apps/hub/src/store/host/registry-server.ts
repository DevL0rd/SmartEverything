import {
  ACCESS_LIFECYCLE_READ_UNITS,
  ACCESS_LIFECYCLE_WRITE_UNITS,
} from '../../server/access-lifecycle-units';
import { ACCESS_READ_UNITS, ACCESS_WRITE_UNITS } from '../../server/access-units';
import { AUTOMATION_VALUE_WRITE_UNITS } from '../../server/handlers/automation-value-units';
import { DAV_TARGET_UNIT } from '../../server/dav/target-unit';
import { CHECK_COMMANDS_UNIT, DEVICE_SCOPE_UNIT } from '../../server/command-units';
import { PERSON_BUDGET_REFUSAL_UNIT } from '../../server/automation-integration-units';
import { SETTINGS_WRITE_UNITS } from '../../server/settings-units';
import { CONFINED_CHATS_UNIT } from '../../server/confinement-units';
import { DRIVE_SERVING_READ_UNITS } from '../../server/drive-serving-units';
import { AI_REPAIR_READ_UNITS, AI_REPAIR_WRITE_UNITS } from '../../server/handlers/ai-repair-units';
import { AUTOMATION_PROGRAM_READ_UNITS } from '../../server/handlers/automation-program-units';
import { TELEVISION_READ_UNITS } from '../../server/handlers/television-units';
import { DEVICE_READ_UNITS, DEVICE_WRITE_UNITS } from '../../server/handlers/device-units';
import { HEALTH_WRITE_UNITS } from '../../server/handlers/health-units';
import { PLANNER_ITEM_WRITE_UNITS } from '../../server/handlers/planner-item-units';
import { NUTRITION_READ_UNITS, NUTRITION_WRITE_UNITS } from '../../server/handlers/nutrition-units';
import {
  PLANNER_SHARED_READ_UNITS,
  PLANNER_SHARED_WRITE_UNITS,
} from '../../server/handlers/planner-shared-units';
import { TALK_READ_UNITS, TALK_WRITE_UNITS } from '../../server/handlers/talk-units';
import { MEDIA_READ_UNITS, MEDIA_WRITE_UNITS } from '../../server/handlers/media-units';
import { ACTIVE_PROFILE_UNIT, LIVE_VIEWS_UNIT } from '../../server/live-views';
import { PERSON_ACCESS_READ_UNITS } from '../../server/person-access-units';
import {
  CALLER_SCOPES_UNIT,
  REACHABLE_DEVICES_UNIT,
  ROUTE_SCOPE_UNIT,
} from '../../server/person-scope-units';

export const SERVER_READ_UNITS = {
  activeProfile: ACTIVE_PROFILE_UNIT,
  callerScopes: CALLER_SCOPES_UNIT,
  checkCommands: CHECK_COMMANDS_UNIT,
  deviceScope: DEVICE_SCOPE_UNIT,
  davTarget: DAV_TARGET_UNIT,
  liveViews: LIVE_VIEWS_UNIT,
  reachableDevices: REACHABLE_DEVICES_UNIT,
  routeScope: ROUTE_SCOPE_UNIT,
  personBudgetRefusal: PERSON_BUDGET_REFUSAL_UNIT,
  confinedChats: CONFINED_CHATS_UNIT,
  ...DRIVE_SERVING_READ_UNITS,
  ...AI_REPAIR_READ_UNITS,
  ...AUTOMATION_PROGRAM_READ_UNITS,
  ...TELEVISION_READ_UNITS,
  ...PERSON_ACCESS_READ_UNITS,
  ...ACCESS_READ_UNITS,
  ...ACCESS_LIFECYCLE_READ_UNITS,
  ...DEVICE_READ_UNITS,
  ...MEDIA_READ_UNITS,
  ...NUTRITION_READ_UNITS,
  ...PLANNER_SHARED_READ_UNITS,
  ...TALK_READ_UNITS,
} as const;

export const SERVER_WRITE_UNITS = {
  ...ACCESS_WRITE_UNITS,
  ...ACCESS_LIFECYCLE_WRITE_UNITS,
  ...AUTOMATION_VALUE_WRITE_UNITS,
  ...DEVICE_WRITE_UNITS,
  ...MEDIA_WRITE_UNITS,
  ...HEALTH_WRITE_UNITS,
  ...NUTRITION_WRITE_UNITS,
  ...PLANNER_ITEM_WRITE_UNITS,
  ...PLANNER_SHARED_WRITE_UNITS,
  ...TALK_WRITE_UNITS,
  ...SETTINGS_WRITE_UNITS,
  ...AI_REPAIR_WRITE_UNITS,
} as const;
