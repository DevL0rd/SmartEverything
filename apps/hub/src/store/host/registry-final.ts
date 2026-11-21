import { PERSON_HOUR24_UNIT } from '../../clock/person-clock-units';
import { SHARED_CLIPBOARD_PREF_UNIT } from '../../clipboard/clipboard-units';
import { IMAGE_AUTHORITY_UNIT } from '../../server/image-authority-units';
import {
  LEDGER_PENDING_GENERATIONS_UNIT,
  LEDGER_RECONCILE_UNIT,
  LEDGER_SPEND_ROWS_UNIT,
} from '../../ledger/units';
import { PROJECT_AUTHORITY_UNIT } from '../../projects/authority-units';
import {
  REFERENCE_CHAT_RESOLVE_UNIT,
  REFERENCE_CHATS_UNIT,
  REFERENCE_SEARCH_ADMISSION_UNIT,
} from '../../references/reference-units';
import { VACUUM_HELD_UNIT } from '../../vacuum/vacuum-units';
import { CHAT_MIRROR_UNIT } from '../chat-mirror';
import { ATTACHMENT_CHAT_MODEL_UNIT } from '../../server/media-model-unit';
import { STATE_CHANGE_CAUSE_UNIT } from '../../signals/sources/device-cause-units';

export const FINAL_READ_UNITS = {
  attachmentChatModel: ATTACHMENT_CHAT_MODEL_UNIT,
  chatMirror: CHAT_MIRROR_UNIT,
  imageAuthority: IMAGE_AUTHORITY_UNIT,
  ledgerPendingGenerations: LEDGER_PENDING_GENERATIONS_UNIT,
  ledgerSpendRows: LEDGER_SPEND_ROWS_UNIT,
  personHour24: PERSON_HOUR24_UNIT,
  projectAuthority: PROJECT_AUTHORITY_UNIT,
  referenceChatResolve: REFERENCE_CHAT_RESOLVE_UNIT,
  referenceChats: REFERENCE_CHATS_UNIT,
  referenceSearchAdmission: REFERENCE_SEARCH_ADMISSION_UNIT,
  sharedClipboardPref: SHARED_CLIPBOARD_PREF_UNIT,
  stateChangeCause: STATE_CHANGE_CAUSE_UNIT,
  vacuumHeld: VACUUM_HELD_UNIT,
} as const;

export const FINAL_WRITE_UNITS = {
  ledgerReconcile: LEDGER_RECONCILE_UNIT,
} as const;
