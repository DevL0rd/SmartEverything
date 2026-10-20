import {
  IMAGE_NOTICES,
  LISTENING_NOTICES,
  PHONE_EAR_NOTICE,
  VOICE_NOTICES,
  WAKE_TEST_NOTICES,
} from '../features/assistant';
import { CLIPBOARD_NOTICE } from '../features/clipboard';
import { COMPUTER_NOTICES } from '../features/computers';
import { PHONE_DETAIL_NOTICES } from '../features/phone';
import { BRUSH_LIVE_NOTICES } from '../plugins/toothbrush/data/brush-live';
import { TREADMILL_LIVE_NOTICES } from '../plugins/treadmill/data/treadmill-live';
import { CODEX_PROVIDER_NOTICES } from '../queries/codex-provider-notices';
import { HARNESS_NOTICES } from '../queries/harness-notices';
import { receivePreviewNotice } from '../queries/preview-notices';
import { PROVIDER_NOTICES } from '../queries/provider-notices';
import { receiveTranscriptNotice } from '../queries/transcript-notices';
import { ASSISTANT_STATUS_NOTICE } from './assistant-response-style';
import { COMPUTER_LIVE_NOTICES } from './computer-live-notices';
import { noticeHandler, type NoticeHandler } from './notice-registry';

export const FEATURE_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['transcript_changed'], (_message, { client }) => {
    receiveTranscriptNotice(client);
  }),
  noticeHandler(['ai_preview'], (message, { client }) => {
    receivePreviewNotice(client, message);
  }),
  ...HARNESS_NOTICES,
  PROVIDER_NOTICES,
  CODEX_PROVIDER_NOTICES,
  ASSISTANT_STATUS_NOTICE,
  IMAGE_NOTICES,
  ...LISTENING_NOTICES,
  ...VOICE_NOTICES,
  ...WAKE_TEST_NOTICES,
  PHONE_EAR_NOTICE,
  CLIPBOARD_NOTICE,
  COMPUTER_NOTICES,
  COMPUTER_LIVE_NOTICES,
  PHONE_DETAIL_NOTICES,
  TREADMILL_LIVE_NOTICES,
  BRUSH_LIVE_NOTICES,
];
