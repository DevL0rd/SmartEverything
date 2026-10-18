import { noticeHandler } from '../../../store/notice-registry';
import { receiveSharedClip } from './clipboard-bridge';

export const CLIPBOARD_NOTICE = noticeHandler(['clipboard'], (message) => {
  receiveSharedClip({ text: message.text, from: message.from, at: message.at });
});
