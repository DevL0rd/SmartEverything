import { noticeHandler, type NoticeHandler } from '../../../../store/notice-registry';
import { receiveWakeTestLine } from './wake-test-lines';

export const WAKE_TEST_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['wake_test_heard'], (message) => {
    receiveWakeTestLine(message.line);
  }),
];
