import { computerLive } from './computer-live';
import { noticeHandler } from './notice-registry';

export const COMPUTER_LIVE_NOTICES = noticeHandler(['computer_live'], (message) => {
  computerLive.receive(message);
});
