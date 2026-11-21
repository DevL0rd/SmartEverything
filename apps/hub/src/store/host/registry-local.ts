import { MCP_BEARER_UNIT } from '../../extensions/mcp/bearer-units';
import {
  MCP_ACTING_CLIENT_UNIT,
  MCP_ACTING_PROFILE_UNIT,
  MCP_READABLE_ATTACHMENT_UNIT,
  SET_DISABLED_MCP_TOOLS_UNIT,
} from '../../extensions/mcp/tools/acting-units';
import { MCP_DEVICE_FACTS_UNIT } from '../../extensions/mcp/tools/device-detail-units';
import { MCP_DEVICE_GROUP_SUMMARIES_UNIT } from '../../extensions/mcp/tools/device-group-units';
import { MCP_HEALTH_SUMMARY_UNIT } from '../../extensions/mcp/tools/health-summary-units';
import {
  MCP_VISIBLE_BUCKETS_UNIT,
  MCP_VISIBLE_EVENTS_UNIT,
  MCP_VISIBLE_HISTORY_UNIT,
} from '../../extensions/mcp/tools/history-units';
import {
  MCP_DEVICE_WITH_ROOMS_UNIT,
  MCP_HOME_COUNTS_UNIT,
  MCP_HOME_DEVICES_UNIT,
  MCP_REMOTE_ROWS_UNIT,
  MCP_REPORTED_UNIT,
  MCP_SEARCH_ROWS_UNIT,
} from '../../extensions/mcp/tools/home-units';
import {
  MCP_PLANNER_GUESTS_UNIT,
  MCP_PLANNER_ITEM_UNIT,
  MCP_PLANNER_PROPOSE_UNIT,
  MCP_PLANNER_SHARING_UNIT,
  MCP_PLANNER_TASKS_UNIT,
  MCP_PLANNER_TIMERS_UNIT,
  MCP_PLANNER_VISIBLE_UNIT,
} from '../../extensions/mcp/tools/planner-units';
import { MCP_UPDATE_REQUESTER_UNIT } from '../../extensions/mcp/tools/update-requester-units';
import {
  MCP_USAGE_LEDGER_UNIT,
  MCP_USAGE_REPORT_UNIT,
  MCP_USAGE_TOTALS_UNIT,
} from '../../extensions/mcp/tools/usage-units';
import {
  LOCAL_CONFIG_UNIT,
  LOCAL_ENTRY_DEVICE_UNIT,
  LOCAL_SIGHT_UNIT,
  PASSIVE_ADMISSIBLE_UNIT,
  PASSIVE_COMMIT_UNIT,
  PASSIVE_ENTRY_OF_DEVICE_UNIT,
  PASSIVE_LINKED_UNIT,
  PASSIVE_READ_UNIT,
} from '../../local/local-units';
import {
  SCALE_ASSIGN_UNIT,
  SCALE_OUTDATED_UNIT,
  SCALE_RECOMPUTE_UNIT,
  SCALE_RECORD_UNIT,
} from '../../local/scale-units';
import { WATCH_UPLOAD_UNIT } from '../../local/watch-uploads';
import {
  BRUSH_OBSERVED_UNIT,
  BRUSH_PAGE_UNIT,
  BRUSH_RECORDS_UNIT,
  BRUSH_RETAINED_UNIT,
  BRUSH_SAVE_HEAD_UNIT,
  LOCAL_COMMAND_ROLE_UNIT,
} from '../../local/toothbrush/brush-units';
import {
  BOTTLE_ACTION_PLAN_UNIT,
  BOTTLE_CAP_UNIT,
  BOTTLE_COMMAND_ACTOR_UNIT,
  BOTTLE_FORGET_CLASSIFIER_UNIT,
  BOTTLE_PLANS_UNIT,
  BOTTLE_REDERIVE_UNIT,
  BOTTLE_SYNC_UNIT,
  BOTTLE_VIEW_UNIT,
} from '../../local/bottle/bottle-units';
import {
  TREADMILL_ASSIGN_UNIT,
  TREADMILL_CLOSE_ORPHANS_UNIT,
  TREADMILL_FINISH_UNIT,
  TREADMILL_FLUSH_UNIT,
  TREADMILL_FORGET_UNIT,
  TREADMILL_MAINTENANCE_UNIT,
  TREADMILL_OPEN_UNIT,
  TREADMILL_RECOMPUTE_UNIT,
  TREADMILL_RECONCILE_UNIT,
  TREADMILL_SESSION_DETAIL_UNIT,
  TREADMILL_STARTER_UNIT,
  TREADMILL_WALKER_UNIT,
} from '../../local/treadmill/session-units';
import { OAUTH_ISSUE_UNIT, OAUTH_MAKE_ROOM_UNIT } from '../../extensions/mcp/oauth/oauth-units';
import {
  PUSH_ALBUM_ACTIVITY_UNIT,
  PUSH_AUDIENCE_UNIT,
  PUSH_DRIVE_NAMES_UNIT,
} from '../../extensions/push/push-units';

const DEVICE_SUBSYSTEM_READ_UNITS = {
  bottleActionPlan: BOTTLE_ACTION_PLAN_UNIT,
  bottleCap: BOTTLE_CAP_UNIT,
  bottleCommandActor: BOTTLE_COMMAND_ACTOR_UNIT,
  bottlePlans: BOTTLE_PLANS_UNIT,
  bottleView: BOTTLE_VIEW_UNIT,
  brushPage: BRUSH_PAGE_UNIT,
  brushRecords: BRUSH_RECORDS_UNIT,
  localCommandRole: LOCAL_COMMAND_ROLE_UNIT,
  treadmillMaintenance: TREADMILL_MAINTENANCE_UNIT,
  treadmillSessionDetail: TREADMILL_SESSION_DETAIL_UNIT,
  treadmillStarter: TREADMILL_STARTER_UNIT,
  treadmillWalker: TREADMILL_WALKER_UNIT,
} as const;

const DEVICE_SUBSYSTEM_WRITE_UNITS = {
  bottleForgetClassifier: BOTTLE_FORGET_CLASSIFIER_UNIT,
  bottleRederive: BOTTLE_REDERIVE_UNIT,
  bottleSync: BOTTLE_SYNC_UNIT,
  brushObserved: BRUSH_OBSERVED_UNIT,
  brushRetained: BRUSH_RETAINED_UNIT,
  brushSaveHead: BRUSH_SAVE_HEAD_UNIT,
  treadmillAssign: TREADMILL_ASSIGN_UNIT,
  treadmillCloseOrphans: TREADMILL_CLOSE_ORPHANS_UNIT,
  treadmillFinish: TREADMILL_FINISH_UNIT,
  treadmillFlush: TREADMILL_FLUSH_UNIT,
  treadmillForget: TREADMILL_FORGET_UNIT,
  treadmillOpen: TREADMILL_OPEN_UNIT,
  treadmillRecompute: TREADMILL_RECOMPUTE_UNIT,
  treadmillReconcile: TREADMILL_RECONCILE_UNIT,
} as const;

export const LOCAL_READ_UNITS = {
  ...DEVICE_SUBSYSTEM_READ_UNITS,
  localEntryDevice: LOCAL_ENTRY_DEVICE_UNIT,
  localSight: LOCAL_SIGHT_UNIT,
  mcpActingClient: MCP_ACTING_CLIENT_UNIT,
  mcpActingProfile: MCP_ACTING_PROFILE_UNIT,
  mcpBearer: MCP_BEARER_UNIT,
  mcpDeviceFacts: MCP_DEVICE_FACTS_UNIT,
  mcpDeviceGroupSummaries: MCP_DEVICE_GROUP_SUMMARIES_UNIT,
  mcpDeviceWithRooms: MCP_DEVICE_WITH_ROOMS_UNIT,
  mcpHealthSummary: MCP_HEALTH_SUMMARY_UNIT,
  mcpHomeCounts: MCP_HOME_COUNTS_UNIT,
  mcpHomeDevices: MCP_HOME_DEVICES_UNIT,
  mcpPlannerGuests: MCP_PLANNER_GUESTS_UNIT,
  mcpPlannerItem: MCP_PLANNER_ITEM_UNIT,
  mcpPlannerSharing: MCP_PLANNER_SHARING_UNIT,
  mcpPlannerTasks: MCP_PLANNER_TASKS_UNIT,
  mcpPlannerTimers: MCP_PLANNER_TIMERS_UNIT,
  mcpPlannerVisible: MCP_PLANNER_VISIBLE_UNIT,
  mcpReadableAttachment: MCP_READABLE_ATTACHMENT_UNIT,
  mcpRemoteRows: MCP_REMOTE_ROWS_UNIT,
  mcpReported: MCP_REPORTED_UNIT,
  mcpSearchRows: MCP_SEARCH_ROWS_UNIT,
  mcpUpdateRequester: MCP_UPDATE_REQUESTER_UNIT,
  mcpUsageLedger: MCP_USAGE_LEDGER_UNIT,
  mcpUsageReport: MCP_USAGE_REPORT_UNIT,
  mcpUsageTotals: MCP_USAGE_TOTALS_UNIT,
  mcpVisibleBuckets: MCP_VISIBLE_BUCKETS_UNIT,
  mcpVisibleEvents: MCP_VISIBLE_EVENTS_UNIT,
  mcpVisibleHistory: MCP_VISIBLE_HISTORY_UNIT,
  passiveAdmissible: PASSIVE_ADMISSIBLE_UNIT,
  passiveEntryOfDevice: PASSIVE_ENTRY_OF_DEVICE_UNIT,
  passiveLinked: PASSIVE_LINKED_UNIT,
  passiveRead: PASSIVE_READ_UNIT,
  pushAlbumActivity: PUSH_ALBUM_ACTIVITY_UNIT,
  pushAudience: PUSH_AUDIENCE_UNIT,
  pushDriveNames: PUSH_DRIVE_NAMES_UNIT,
  scaleOutdated: SCALE_OUTDATED_UNIT,
} as const;

export const LOCAL_WRITE_UNITS = {
  ...DEVICE_SUBSYSTEM_WRITE_UNITS,
  localConfig: LOCAL_CONFIG_UNIT,
  mcpPlannerPropose: MCP_PLANNER_PROPOSE_UNIT,
  oauthIssue: OAUTH_ISSUE_UNIT,
  oauthMakeRoom: OAUTH_MAKE_ROOM_UNIT,
  passiveCommit: PASSIVE_COMMIT_UNIT,
  scaleAssign: SCALE_ASSIGN_UNIT,
  scaleRecompute: SCALE_RECOMPUTE_UNIT,
  scaleRecord: SCALE_RECORD_UNIT,
  setDisabledMcpTools: SET_DISABLED_MCP_TOOLS_UNIT,
  watchUpload: WATCH_UPLOAD_UNIT,
} as const;
