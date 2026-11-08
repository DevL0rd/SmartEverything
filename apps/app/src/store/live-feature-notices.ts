import {
  IMAGE_NOTICES,
  LISTENING_NOTICES,
  PHONE_EAR_NOTICE,
  VOICE_NOTICES,
  WAKE_TEST_NOTICES,
} from '../features/assistant';
import { APP_UPDATE_NOTICES } from '../features/app-updates';
import { CLIPBOARD_NOTICE } from '../features/clipboard';
import { COMPUTER_NOTICES } from '../features/computers';
import { DRIVE_NOTICE_HANDLERS } from '../features/nas/data/notices';
import { PLANNER_NOTICES } from '../features/planner/data';
import { HUB_UPDATE_NOTICES, HUB_UPDATE_SOURCE_NOTICES } from '../features/hub-updates';
import { PHONE_DETAIL_NOTICES } from '../features/phone';
import { BRUSH_LIVE_NOTICES } from '../plugins/toothbrush/data/brush-live';
import { TREADMILL_LIVE_NOTICES } from '../plugins/treadmill/data/treadmill-live';
import { CODEX_PROVIDER_NOTICES } from '../queries/codex-provider-notices';
import { HARNESS_CATALOGUE_KEY, HARNESS_NOTICES } from '../queries/harness-notices';
import { refreshSubscriptionMeterHistory } from '../queries/chat-meter-history';
import { background } from '@smarteverything/logging';
import { PROVIDER_NOTICES } from '../queries/provider-notices';
import { receiveTranscriptNotice } from '../queries/transcript-notices';
import { ASSISTANT_STATUS_NOTICE } from './assistant-response-style';
import { COMPUTER_LIVE_NOTICES } from './computer-live-notices';
import { noticeHandler, type NoticeHandler } from './notice-registry';

export const FEATURE_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['transcript_changed'], (_message, { client }) => {
    receiveTranscriptNotice(client);
  }),
  ...HARNESS_NOTICES,
  noticeHandler(['ai_subscription_usage_changed'], ({ source }, { client }) => {
    refreshSubscriptionMeterHistory(client);
    if (source === 'route')
      background(
        client.invalidateQueries({ queryKey: HARNESS_CATALOGUE_KEY }),
        'queries.invalidate_failed',
      );
  }),
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
  APP_UPDATE_NOTICES,
  HUB_UPDATE_NOTICES,
  HUB_UPDATE_SOURCE_NOTICES,
  ...DRIVE_NOTICE_HANDLERS,
  ...PLANNER_NOTICES,
];
