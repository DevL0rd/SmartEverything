import type { AiChatRow } from '@smarteverything/domain';
import { MINUTE_MS, relative } from '../../../format/time';
import type { AreaStatus } from '../model/area-status';

export type QuickAskChoice = 'new' | 'continue';

export type QuickAskCandidate = Pick<
  AiChatRow,
  'profile_id' | 'kind' | 'archived_at' | 'deletion_state' | 'last_message_at' | 'created_at'
>;

export const OFFLINE_NEW_CHAT_REASON = 'Offline. A new chat starts when your hub is back.';

function activityOf(chat: QuickAskCandidate): number {
  return Date.parse(chat.last_message_at ?? chat.created_at);
}

export function latestChat<T extends QuickAskCandidate>(
  chats: readonly T[],
  profileId: string | null,
): T | null {
  let latest: T | null = null;
  for (const chat of chats) {
    const open = chat.kind === 'chat' && chat.archived_at === null && chat.deletion_state === null;
    if (
      open &&
      chat.profile_id === profileId &&
      (latest === null || activityOf(chat) > activityOf(latest))
    ) {
      latest = chat;
    }
  }
  return latest;
}

export function preferredChoice(
  latest: QuickAskCandidate | null,
  reuseMinutes: number,
  now: number,
): QuickAskChoice {
  return latest !== null && now - activityOf(latest) < reuseMinutes * MINUTE_MS
    ? 'continue'
    : 'new';
}

export function chosenTarget(
  picked: QuickAskChoice | null,
  preferred: QuickAskChoice,
  hasLatest: boolean,
): QuickAskChoice {
  return hasLatest ? (picked ?? preferred) : 'new';
}

export function continueLabel(
  chat: Pick<AiChatRow, 'title' | 'last_message_at' | 'created_at'>,
  now: number,
): string {
  return `Continue “${chat.title}” (${relative(chat.last_message_at ?? chat.created_at, now)})`;
}

export function newChatReason(area: AreaStatus['kind']): string | null {
  return area === 'offline-cached' || area === 'offline-empty' ? OFFLINE_NEW_CHAT_REASON : null;
}
