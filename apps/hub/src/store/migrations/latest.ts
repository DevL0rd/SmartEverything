import { PHOTOS_LIBRARY_MIGRATION } from './photos-library';
import { PHOTOS_DESKTOP_BACKUP_MIGRATION } from './photos-desktop-backup';
import { AI_REPAIR_CHAT_MIGRATION } from './ai-repair-chat';
import { UPLOAD_RESULTS_MIGRATION } from './upload-results';
import { LOG_RELEASE_MIGRATION } from './log-release';
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
import { DEVICE_MACS_MIGRATION } from './device-macs';
import { VACUUM_MIGRATION } from './vacuum';
import { IR_APPLIANCES_MIGRATION } from './ir-appliances';
import { VACUUM_ROOM_LINKS_MIGRATION } from './vacuum-room-links';
import { automationGraphsMigration } from './automation-graphs';
import { HOME_MAP_MIGRATION } from './home-map';
import { MODELS_MIGRATION } from './models';
import { HOME_MAP_SET_MIGRATION } from './home-map-set';
import { MODEL_LODS_MIGRATION } from './model-lods';
import { AUTOMATION_PLUGIN_KINDS_MIGRATION } from './automation-plugin-kinds';
import { HARNESS_CONTEXT_REQUEST_MIGRATION } from './harness-context-request';
import { AI_MEMORIES_MIGRATION } from './ai-memories';
import { AI_MEMORY_EMBEDDINGS_MIGRATION } from './ai-memory-embeddings';
import { HARNESS_CHILDREN_DROP_MIGRATION } from './harness-children-drop';
import { LEGACY_HISTORY_IMPORT_MIGRATION } from './legacy-history-import';
import { CHAT_LOOP_SETTINGS_DROP_MIGRATION } from './chat-loop-settings-drop';
import { STARTER_CUSTOM_NODES_MIGRATION } from './starter-custom-nodes';
import { SUBAGENT_MODEL_CHOICE_DROP_MIGRATION } from './subagent-model-choice-drop';
import { HELPER_DELETE_ACTION_MIGRATION } from './helper-delete-action';
import { IMAGE_FALLBACK_ORDER_DROP_MIGRATION } from './image-fallback-order-drop';
import { MODEL_FLAT_DROP_MIGRATION } from './model-flat-drop';
import { HOME_MAP_OBJECT_AXES_MIGRATION } from './home-map-object-axes';
import { CHAT_MEMORY_MIGRATION } from './chat-memory';
import { AI_MEMORY_STRENGTH_MIGRATION } from './ai-memory-strength';
import { CHAT_CACHE_READS_MIGRATION } from './chat-cache-reads';
import { RUNTIME_LOGS_MIGRATION } from './runtime-logs';
import { HUB_UPDATE_NOTES_MIGRATION } from './hub-update-notes';
import { AI_REPAIR_INBOX_MIGRATION } from './ai-repair-inbox';
import { AI_REPAIR_ADMISSION_MIGRATION } from './ai-repair-admission';
import { AI_REPAIR_OUTCOMES_MIGRATION } from './ai-repair-outcomes';
import { ANDROID_BUILD_OBSERVATIONS_MIGRATION } from './android-build-observations';
import { NATIVE_CHAT_ADMISSION_MIGRATION } from './native-chat-admission';
import { AI_REPAIR_DISMISSAL_MIGRATION } from './ai-repair-dismissal';
import { AI_CHAT_METER_HISTORY_MIGRATION } from './ai-chat-meter-history';
import { AI_CHAT_HELPER_NAMES_MIGRATION } from './ai-chat-helper-names';
import { AI_HELPER_DIALOGUE_MIGRATION } from './ai-helper-dialogue';
import { ASSISTANT_REACTIONS_MIGRATION } from './assistant-reactions';
import { AI_WEEKLY_SUBSCRIPTION_HISTORY_MIGRATION } from './ai-weekly-subscription-history';
import { DESKTOP_WINDOW_CREDENTIALS_MIGRATION } from './desktop-window-credentials';
import { FLAT_MAP_VIEWS_DROP_MIGRATION } from './flat-map-views-drop';
import { PLANNER_TABLES_MIGRATION } from './planner-tables';
import { GOOGLE_ACCOUNTS_MIGRATION } from './google-accounts';
import { ANDROID_BUILD_OUTCOMES_MIGRATION } from './android-build-outcomes';
import { DRIVE_MIGRATION } from './drive';
import { DRIVE_STORAGE_MIGRATION } from './drive-storage';
import { PHOTOS_MIGRATION } from './photos';
import { PLANNER_MEMBER_AREA_MIGRATION } from './planner-member-area';
import { SCALE_NO_WEIGHT_MIGRATION } from './scale-no-weight';
import { MESSAGE_QUOTES_MIGRATION } from './message-quotes';
import { ATTACHMENT_LEVELS_MIGRATION } from './attachment-levels';
import { RELAYED_PARTICIPANTS_MIGRATION } from './relayed-participants';
import { ONE_CONVERSATION_CHAT_MIGRATION } from './one-conversation-chat';
import { HUB_OWN_DEVICE_MIGRATION } from './hub-own-device';
import { DRIVE_PLACEMENTS_MIGRATION } from './drive-placements';
import { DRIVE_CONFLICTS_MIGRATION } from './drive-conflicts';
import { QUOTE_EXCERPTS_MIGRATION } from './quote-excerpts';
import { OPENROUTER_DEFAULT_MODEL_DROP_MIGRATION } from './openrouter-default-model-drop';

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
  DEVICE_MACS_MIGRATION,
  VACUUM_MIGRATION,
  VACUUM_ROOM_LINKS_MIGRATION,
  IR_APPLIANCES_MIGRATION,
  automationGraphsMigration(143),
  HOME_MAP_MIGRATION,
  MODELS_MIGRATION,
  HOME_MAP_SET_MIGRATION,
  MODEL_LODS_MIGRATION,
  AUTOMATION_PLUGIN_KINDS_MIGRATION,
  HARNESS_CONTEXT_REQUEST_MIGRATION,
  AI_MEMORIES_MIGRATION,
  HARNESS_CHILDREN_DROP_MIGRATION,
  LEGACY_HISTORY_IMPORT_MIGRATION,
  CHAT_LOOP_SETTINGS_DROP_MIGRATION,
  STARTER_CUSTOM_NODES_MIGRATION,
  SUBAGENT_MODEL_CHOICE_DROP_MIGRATION,
  HELPER_DELETE_ACTION_MIGRATION,
  IMAGE_FALLBACK_ORDER_DROP_MIGRATION,
  MODEL_FLAT_DROP_MIGRATION,
  HOME_MAP_OBJECT_AXES_MIGRATION,
  AI_MEMORY_EMBEDDINGS_MIGRATION,
  CHAT_MEMORY_MIGRATION,
  AI_MEMORY_STRENGTH_MIGRATION,
  CHAT_CACHE_READS_MIGRATION,
  RUNTIME_LOGS_MIGRATION,
  HUB_UPDATE_NOTES_MIGRATION,
  AI_REPAIR_INBOX_MIGRATION,
  AI_REPAIR_ADMISSION_MIGRATION,
  AI_REPAIR_OUTCOMES_MIGRATION,
  ANDROID_BUILD_OBSERVATIONS_MIGRATION,
  NATIVE_CHAT_ADMISSION_MIGRATION,
  AI_REPAIR_DISMISSAL_MIGRATION,
  AI_CHAT_METER_HISTORY_MIGRATION,
  AI_CHAT_HELPER_NAMES_MIGRATION,
  AI_HELPER_DIALOGUE_MIGRATION,
  ASSISTANT_REACTIONS_MIGRATION,
  AI_WEEKLY_SUBSCRIPTION_HISTORY_MIGRATION,
  DESKTOP_WINDOW_CREDENTIALS_MIGRATION,
  FLAT_MAP_VIEWS_DROP_MIGRATION,
  PLANNER_TABLES_MIGRATION,
  GOOGLE_ACCOUNTS_MIGRATION,
  DRIVE_MIGRATION,
  DRIVE_STORAGE_MIGRATION,
  PHOTOS_MIGRATION,
  ANDROID_BUILD_OUTCOMES_MIGRATION,
  PLANNER_MEMBER_AREA_MIGRATION,
  SCALE_NO_WEIGHT_MIGRATION,
  MESSAGE_QUOTES_MIGRATION,
  ATTACHMENT_LEVELS_MIGRATION,
  RELAYED_PARTICIPANTS_MIGRATION,
  ONE_CONVERSATION_CHAT_MIGRATION,
  HUB_OWN_DEVICE_MIGRATION,
  DRIVE_PLACEMENTS_MIGRATION,
  DRIVE_CONFLICTS_MIGRATION,
  QUOTE_EXCERPTS_MIGRATION,
  OPENROUTER_DEFAULT_MODEL_DROP_MIGRATION,
  AI_REPAIR_CHAT_MIGRATION,
  LOG_RELEASE_MIGRATION,
  UPLOAD_RESULTS_MIGRATION,
  PHOTOS_DESKTOP_BACKUP_MIGRATION,
  PHOTOS_LIBRARY_MIGRATION,
];
