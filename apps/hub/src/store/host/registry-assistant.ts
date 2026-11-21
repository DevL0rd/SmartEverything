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
import { GRANT_CHECK_UNIT } from '../../harness/grant-check';
import { HELPER_WRITER_RESUME_UNIT } from '../../harness/helper-writer-renewal';
import {
  SESSION_ACQUIRE_UNIT,
  SESSION_APPEND_UNIT,
  SESSION_CREATE_UNIT,
  SESSION_REWRITE_UNIT,
} from '../../harness/session-units';

export const ASSISTANT_READ_UNITS = {
  homeMirror: HOME_MIRROR_UNIT,
  wakeRead: WAKE_READ_UNIT,
  talkRoster: TALK_ROSTER_UNIT,
  assistantSendInputs: SEND_INPUTS_UNIT,
  harnessGrant: GRANT_CHECK_UNIT,
} as const;

export const ASSISTANT_WRITE_UNITS = {
  callRecordOpen: CALL_RECORD_OPEN_UNIT,
  callRecordSave: CALL_RECORD_SAVE_UNIT,
  chatWidgetsShow: WIDGETS_SHOW_UNIT,
  imageRecover: IMAGE_RECOVER_UNIT,
  imageSettle: IMAGE_SETTLE_UNIT,
  talkClearUnfinished: TALK_CLEAR_UNFINISHED_UNIT,
  talkPrune: TALK_PRUNE_UNIT,
  talkRelabel: TALK_RELABEL_UNIT,
  assistantEventQueue: EVENT_QUEUE_UNIT,
  assistantMessageAdd: MESSAGE_ADD_UNIT,
  assistantMessageEvent: MESSAGE_EVENT_UNIT,
  assistantMessageSend: MESSAGE_SEND_UNIT,
  assistantNativeAdmit: NATIVE_ADMIT_UNIT,
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
