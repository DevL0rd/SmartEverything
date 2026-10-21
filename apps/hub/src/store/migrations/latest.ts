import { AUTOMATIONS_V3_MIGRATION } from './automations-v3-data';
import { CAMERA_KEEP_DAYS_MIGRATION } from './camera-keep-days';
import { DEVICE_CONTROL_FLAT_MIGRATION } from './device-control-flat';
import { LAUNDRY_NOTICES_MIGRATION } from './laundry-notices';
import type { Migration } from './migration';
import { OLD_AUTOMATIONS_DROP_MIGRATION } from './old-automations-drop';
import { PORT_WIRES_MIGRATION } from './port-wires';
import { MCP_TOKEN_ACCESS_MIGRATION } from './mcp-token-access';
import { TOOL_SCHEME_MIGRATION } from './tool-scheme';
import { DROP_PREVIEWS_MIGRATION } from './drop-previews';

export const LATEST_MIGRATIONS: readonly Migration[] = [
  AUTOMATIONS_V3_MIGRATION,
  OLD_AUTOMATIONS_DROP_MIGRATION,
  LAUNDRY_NOTICES_MIGRATION,
  PORT_WIRES_MIGRATION,
  CAMERA_KEEP_DAYS_MIGRATION,
  TOOL_SCHEME_MIGRATION,
  MCP_TOKEN_ACCESS_MIGRATION,
  DEVICE_CONTROL_FLAT_MIGRATION,
  DROP_PREVIEWS_MIGRATION,
];
