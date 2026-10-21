import { isInterruption } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { reasonWithActions } from './failure-reason';

export const STOPPED_BY_USER = 'Stopped by the user.';
export const HUB_RESTARTED = 'The hub restarted.';
export const CONNECTION_LOST = 'The connection to the computer was lost.';
const CARRY_ON = 'Carry on with the work from where you left off.';

function cause(reason: string): string {
  return `Your previous turn was interrupted (${reason.replace(/\.$/u, '').toLowerCase()}).`;
}

export const CONTINUE_NOTE = 'Continue the work you were doing.';

export function interruptionNote(store: Store, chatId: string): string | null {
  const reply = store.assistantChat.latestSettledReply(chatId);
  if (reply?.state !== 'failed' || !isInterruption(reply.reason_code)) return null;
  if (store.assistantChat.latestPersonText(chatId)?.id !== reply.reply_to) return null;
  const done = reasonWithActions('', reply.steps).trim();
  return [cause(reply.reason ?? STOPPED_BY_USER), done, CARRY_ON]
    .filter((part) => part !== '')
    .join(' ');
}
