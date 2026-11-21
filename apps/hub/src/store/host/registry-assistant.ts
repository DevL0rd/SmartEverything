import {
  EVENT_QUEUE_UNIT,
  MESSAGE_ADD_UNIT,
  MESSAGE_EVENT_UNIT,
  MESSAGE_SEND_UNIT,
} from '../../assistant/store-units';
import {
  NATIVE_ADMIT_UNIT,
  NATIVE_COMPLETE_UNIT,
  REPLY_START_UNIT,
  REPLY_WRITE_UNIT,
} from '../../assistant/reply-units';
import { SUBAGENT_SESSION_ADOPT_UNIT } from '../../assistant/engines/dsh/children-adoption';
import { HELPER_WRITER_RENEW_UNIT } from '../../assistant/engines/dsh/helper-renewal-unit';
import {
  REPLAY_REQUEUE_UNIT,
  REPLAY_RESTORE_UNIT,
  REPLAY_SETTLE_UNIT,
} from '../../assistant/engines/dsh/replay-units';
import { WIDGETS_SHOW_UNIT } from '../../chat-widgets/show-unit';
import { IMAGE_RECOVER_UNIT, IMAGE_SETTLE_UNIT } from '../../assistant/image/settle-unit';
import { IMAGE_RESERVE_UNIT } from '../../assistant/image/reserve-unit';
import { HOME_MIRROR_UNIT } from '../home-mirror';
import { WAKE_READ_UNIT } from '../../wake/wake-units';
import {
  CALL_RECORD_OPEN_UNIT,
  CALL_RECORD_SAVE_UNIT,
} from '../../assistant-voice/call-record-units';
import {
  TALK_CLEAR_UNFINISHED_UNIT,
  TALK_PRUNE_UNIT,
  TALK_RELABEL_UNIT,
  TALK_ROSTER_UNIT,
} from '../../talk/talk-store-units';
import { MANUAL_COMMAND_RETAIN_UNIT } from '../../assistant/engines/computer/manual-command-unit';
import {
  HELPER_RECONCILE_UNIT,
  HELPER_SETTLE_UNIT,
} from '../../assistant/delegation/helper-settle-unit';
import { SEND_INPUTS_UNIT } from '../../assistant/send-inputs';
import { PREVIEW_ERROR_UNIT, REQUEST_FINISHED_UNIT } from '../../assistant/request-units';
import { HELPER_QUOTE_UNIT, QUOTE_UNIT } from '../../assistant/message-quote';
import {
  HELPER_DIALOGUE_PREPARE_UNIT,
  HELPER_DIALOGUE_QUEUE_UNIT,
} from '../../assistant/delegation/helper-dialogue-units';
import { HELPER_DELIVERY_UNIT } from '../../assistant/delegation/helper-delivery';
import { DELIVERY_ROUTE_UNIT } from '../../assistant/delivery-route-unit';
import {
  REPLAY_CHECK_UNIT,
  REPLAY_EDIT_UNIT,
  REPLAY_RETRY_UNIT,
} from '../../assistant/message-replay-units';
import { CHAT_LINEAGE_UNIT } from '../../assistant/delegation/admission';
import { RELAY_POST_UNIT, SUBAGENT_START_UNIT } from '../../assistant/delegation/relay-units';
import {
  RUN_QUEUED_UNIT,
  RUN_RESTART_UNIT,
  RUN_UPDATE_UNIT,
} from '../../assistant/agent-runs/run-units';
import {
  REPAIR_ADMIT_UNIT,
  REPAIR_EXISTING_PATCH_UNIT,
  REPAIR_EXISTING_UNIT,
  REPAIR_NEEDS_CHAT_UNIT,
} from '../../assistant/repair-units';
import {
  BRANCH_BUILD_UNIT,
  BRANCH_PATH_UNIT,
  NATIVE_BRANCH_BUILD_UNIT,
} from '../../assistant/chat-branch-units';
import {
  CHAT_CHANGE_UNIT,
  CHAT_REMOVE_UNIT,
  CONVERSATIONS_RETITLE_UNIT,
  OWNED_ATTACHMENT_UNIT,
  OWNED_CHAT_UNIT,
  OWNED_MADE_CHAT_UNIT,
  REMOVAL_SCOPE_UNIT,
  VISIBLE_CHATS_UNIT,
} from '../../assistant/chat-ownership';
import {
  GRANT_CHECK_UNIT,
  READER_SESSION_UNIT,
  WRITER_CHECK_UNIT,
} from '../../harness/grant-check';
import { HELPER_WRITER_RESUME_UNIT } from '../../harness/helper-writer-renewal';
import {
  SESSION_ACQUIRE_UNIT,
  SESSION_APPEND_UNIT,
  SESSION_CREATE_UNIT,
  SESSION_REWRITE_UNIT,
} from '../../harness/session-units';

import {
  ATTACHMENT_UNIT,
  BOUND_OPERATION_UNIT,
  EFFECT_AUTHORITIES_UNIT,
  EVENT_ACCEPT_UNIT,
  EVENT_INPUTS_UNIT,
  INGEST_READ_UNIT,
  MEDIA_AUTHORITY_UNIT,
  METERED_INPUTS_UNIT,
  MIRROR_ISSUE_UNIT,
  MIRROR_READ_UNIT,
  OPENING_BIND_UNIT,
  PERMISSION_BEGIN_UNIT,
  PERMISSION_RECOVER_UNIT,
  SESSION_LOG_UNIT,
  SESSION_VIEW_UNIT,
  TURN_RUNNING_UNIT,
  WORK_CHAT_UNIT,
} from '../../harness/store-units';
import {
  FORK_PLAN_READ_UNIT,
  FORK_SEED_READ_UNIT,
  HISTORY_READ_UNIT,
} from '../../harness/fork-units';
import { INPUT_REFUSAL_RETAIN_UNIT } from '../../harness/input-refusal';
import {
  CLAUDE_METADATA_SAVE_UNIT,
  CLAUDE_RECEIVE_UNIT,
} from '../../assistant/engines/claude/provider-units';
import {
  CODEX_RECEIVE_UNIT,
  PROVIDER_AGENTS_UNIT,
  RUNTIME_METADATA_SAVE_UNIT,
  SUBSCRIPTION_USAGE_UNIT,
} from '../../assistant/engines/computer/provider-units';
import {
  EVENT_AUTHORITY_UNIT,
  EVENT_AUTHORITY_VIEW_UNIT,
  EXECUTION_TOOL_UNIT,
} from '../../assistant/event-authority-issue';
import { EFFECTIVE_TOOLS_UNIT } from '../../assistant/tool-scope';
import { TURN_FACTS_UNIT } from '../../assistant/prompt-facts';
import { MODEL_ALLOWED_UNIT } from '../../assistant/model-scope';
import { MACHINE_UNIT } from '../../assistant/machine';
import { CHILD_APPENDED_UNIT } from '../../assistant/engines/dsh/children-units';
import { HELPER_REACTION_READ_UNIT } from '../../assistant/engines/dsh/helper-reaction-read';
import { PARENT_REACTION_READ_UNIT } from '../../assistant/parent-reaction-read';
import {
  PROFILE_CAN_CLAIM_UNIT,
  REPAIR_RECIPIENT_UNIT,
} from '../../assistant/repair-work-recipient';
import {
  INACTIVE_REMOVAL_UNIT,
  REMOVAL_NEEDS_INACTIVE_UNIT,
} from '../../assistant/agent-runs/inactive-removal-unit';
import {
  HELPER_ARTIFACT_COMMIT_UNIT,
  HELPER_ARTIFACT_PREPARE_UNIT,
  HELPER_PAIR_UNIT,
} from '../../assistant/delegation/helper-artifact-units';
import {
  DELEGATION_CLAIM_UNIT,
  DELEGATION_REPORT_UNIT,
} from '../../assistant/delegation/reply-units';
import { PROVIDER_HISTORY_UNIT } from '../../assistant/engines/computer/history-unit';

const ASSISTANT_ROUND2_READ_UNITS = {
  assistantEffectiveTools: EFFECTIVE_TOOLS_UNIT,
  assistantEventAuthorityView: EVENT_AUTHORITY_VIEW_UNIT,
  assistantTurnFacts: TURN_FACTS_UNIT,
  assistantModelAllowed: MODEL_ALLOWED_UNIT,
  assistantMachine: MACHINE_UNIT,
  assistantHelperReactionRead: HELPER_REACTION_READ_UNIT,
  assistantParentReaction: PARENT_REACTION_READ_UNIT,
  assistantProfileCanClaim: PROFILE_CAN_CLAIM_UNIT,
  assistantRepairRecipient: REPAIR_RECIPIENT_UNIT,
  assistantInactiveRemoval: INACTIVE_REMOVAL_UNIT,
  assistantRemovalNeedsInactive: REMOVAL_NEEDS_INACTIVE_UNIT,
  helperArtifactPair: HELPER_PAIR_UNIT,
  helperArtifactPrepare: HELPER_ARTIFACT_PREPARE_UNIT,
  computerProviderHistory: PROVIDER_HISTORY_UNIT,
  assistantExecutionTool: EXECUTION_TOOL_UNIT,
} as const;

const ASSISTANT_ROUND2_WRITE_UNITS = {
  assistantEventAuthority: EVENT_AUTHORITY_UNIT,
  claudeProviderMetadataSave: CLAUDE_METADATA_SAVE_UNIT,
  claudeProviderReceive: CLAUDE_RECEIVE_UNIT,
  codexProviderReceive: CODEX_RECEIVE_UNIT,
  computerProviderAgents: PROVIDER_AGENTS_UNIT,
  computerProviderMetadataSave: RUNTIME_METADATA_SAVE_UNIT,
  computerSubscriptionUsage: SUBSCRIPTION_USAGE_UNIT,
  delegationClaim: DELEGATION_CLAIM_UNIT,
  delegationReport: DELEGATION_REPORT_UNIT,
  helperArtifactCommit: HELPER_ARTIFACT_COMMIT_UNIT,
  nativeChildAppended: CHILD_APPENDED_UNIT,
} as const;

const HARNESS_READ_UNITS = {
  harnessAttachment: ATTACHMENT_UNIT,
  harnessEffectAuthorities: EFFECT_AUTHORITIES_UNIT,
  harnessEventInputs: EVENT_INPUTS_UNIT,
  harnessForkPlanRead: FORK_PLAN_READ_UNIT,
  harnessForkSeedRead: FORK_SEED_READ_UNIT,
  harnessHistoryRead: HISTORY_READ_UNIT,
  harnessIngestRead: INGEST_READ_UNIT,
  harnessMediaAuthority: MEDIA_AUTHORITY_UNIT,
  harnessMeteredInputs: METERED_INPUTS_UNIT,
  harnessMirrorRead: MIRROR_READ_UNIT,
  harnessReader: READER_SESSION_UNIT,
  harnessSessionLog: SESSION_LOG_UNIT,
  harnessSessionView: SESSION_VIEW_UNIT,
  harnessTurnRunning: TURN_RUNNING_UNIT,
  harnessWorkChat: WORK_CHAT_UNIT,
  harnessWriter: WRITER_CHECK_UNIT,
} as const;

const HARNESS_WRITE_UNITS = {
  harnessBoundOperation: BOUND_OPERATION_UNIT,
  harnessEventAccept: EVENT_ACCEPT_UNIT,
  harnessInputRefusalRetain: INPUT_REFUSAL_RETAIN_UNIT,
  harnessMirrorIssue: MIRROR_ISSUE_UNIT,
  harnessOpeningBind: OPENING_BIND_UNIT,
  harnessPermissionBegin: PERMISSION_BEGIN_UNIT,
  harnessPermissionRecover: PERMISSION_RECOVER_UNIT,
} as const;

export const ASSISTANT_READ_UNITS = {
  ...HARNESS_READ_UNITS,
  ...ASSISTANT_ROUND2_READ_UNITS,
  homeMirror: HOME_MIRROR_UNIT,
  wakeRead: WAKE_READ_UNIT,
  talkRoster: TALK_ROSTER_UNIT,
  assistantSendInputs: SEND_INPUTS_UNIT,
  harnessGrant: GRANT_CHECK_UNIT,
  assistantQuote: QUOTE_UNIT,
  assistantHelperQuote: HELPER_QUOTE_UNIT,
  assistantOwnedChat: OWNED_CHAT_UNIT,
  assistantVisibleChats: VISIBLE_CHATS_UNIT,
  assistantOwnedAttachment: OWNED_ATTACHMENT_UNIT,
  assistantOwnedMadeChat: OWNED_MADE_CHAT_UNIT,
  assistantRemovalScope: REMOVAL_SCOPE_UNIT,
  assistantBranchPath: BRANCH_PATH_UNIT,
  assistantRepairExisting: REPAIR_EXISTING_UNIT,
  helperDialoguePrepare: HELPER_DIALOGUE_PREPARE_UNIT,
  assistantChatLineage: CHAT_LINEAGE_UNIT,
  assistantReplayCheck: REPLAY_CHECK_UNIT,
  assistantRepairNeedsChat: REPAIR_NEEDS_CHAT_UNIT,
  assistantRepairExistingPatch: REPAIR_EXISTING_PATCH_UNIT,
} as const;

export const ASSISTANT_WRITE_UNITS = {
  ...HARNESS_WRITE_UNITS,
  ...ASSISTANT_ROUND2_WRITE_UNITS,
  callRecordOpen: CALL_RECORD_OPEN_UNIT,
  callRecordSave: CALL_RECORD_SAVE_UNIT,
  chatWidgetsShow: WIDGETS_SHOW_UNIT,
  imageRecover: IMAGE_RECOVER_UNIT,
  imageSettle: IMAGE_SETTLE_UNIT,
  imageReserve: IMAGE_RESERVE_UNIT,
  talkClearUnfinished: TALK_CLEAR_UNFINISHED_UNIT,
  talkPrune: TALK_PRUNE_UNIT,
  talkRelabel: TALK_RELABEL_UNIT,
  assistantEventQueue: EVENT_QUEUE_UNIT,
  assistantMessageAdd: MESSAGE_ADD_UNIT,
  assistantMessageEvent: MESSAGE_EVENT_UNIT,
  assistantMessageSend: MESSAGE_SEND_UNIT,
  assistantNativeAdmit: NATIVE_ADMIT_UNIT,
  assistantPreviewError: PREVIEW_ERROR_UNIT,
  assistantRequestFinished: REQUEST_FINISHED_UNIT,
  assistantChatRemove: CHAT_REMOVE_UNIT,
  assistantChatChange: CHAT_CHANGE_UNIT,
  assistantBranchBuild: BRANCH_BUILD_UNIT,
  assistantNativeBranchBuild: NATIVE_BRANCH_BUILD_UNIT,
  assistantRepairAdmit: REPAIR_ADMIT_UNIT,
  helperDialogueQueue: HELPER_DIALOGUE_QUEUE_UNIT,
  assistantHelperDelivery: HELPER_DELIVERY_UNIT,
  assistantDeliveryRoute: DELIVERY_ROUTE_UNIT,
  assistantReplayRetry: REPLAY_RETRY_UNIT,
  assistantReplayEdit: REPLAY_EDIT_UNIT,
  assistantRelayPost: RELAY_POST_UNIT,
  assistantSubagentStart: SUBAGENT_START_UNIT,
  agentRunQueued: RUN_QUEUED_UNIT,
  agentRunUpdate: RUN_UPDATE_UNIT,
  agentRunsRestart: RUN_RESTART_UNIT,
  assistantConversationsRetitle: CONVERSATIONS_RETITLE_UNIT,
  assistantNativeComplete: NATIVE_COMPLETE_UNIT,
  assistantReplyStart: REPLY_START_UNIT,
  assistantReplyWrite: REPLY_WRITE_UNIT,
  nativeManualCommandRetain: MANUAL_COMMAND_RETAIN_UNIT,
  nativeReplayRequeue: REPLAY_REQUEUE_UNIT,
  nativeReplayRestore: REPLAY_RESTORE_UNIT,
  nativeReplaySettle: REPLAY_SETTLE_UNIT,
  dshSessionAcquire: SESSION_ACQUIRE_UNIT,
  dshSessionAppend: SESSION_APPEND_UNIT,
  dshSessionCreate: SESSION_CREATE_UNIT,
  dshSessionRewrite: SESSION_REWRITE_UNIT,
  helperDialogueReconcile: HELPER_RECONCILE_UNIT,
  helperDialogueSettle: HELPER_SETTLE_UNIT,
  helperWriterRenew: HELPER_WRITER_RENEW_UNIT,
  helperWriterResume: HELPER_WRITER_RESUME_UNIT,
  subagentSessionAdopt: SUBAGENT_SESSION_ADOPT_UNIT,
} as const;
