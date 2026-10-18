import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import {
  receiveVoiceActivity,
  receiveVoiceCalls,
  receiveVoiceCaption,
  receiveVoiceLevels,
} from './hosted-voice';

export const VOICE_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['voice_activity'], (message) => {
    receiveVoiceActivity(message);
  }),
  noticeHandler(['voice_calls'], (message) => {
    receiveVoiceCalls(message);
  }),
  noticeHandler(['voice_levels'], (message) => {
    receiveVoiceLevels(message);
  }),
  noticeHandler(['voice_caption'], (message) => {
    receiveVoiceCaption(message);
  }),
];
