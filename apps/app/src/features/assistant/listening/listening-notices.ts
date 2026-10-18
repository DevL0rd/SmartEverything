import { background } from '@smarteverything/logging';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { LISTENING_KEY } from './listening-data';
import { receiveLevel } from './listening-level';

export const LISTENING_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['listening_changed'], (_message, { client }) => {
    background(client.invalidateQueries({ queryKey: LISTENING_KEY }), 'queries.invalidate_failed');
  }),
  noticeHandler(['listening_level'], (message) => {
    receiveLevel(message.sourceKey, message.dbfs);
  }),
];
