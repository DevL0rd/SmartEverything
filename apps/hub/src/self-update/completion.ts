import {
  hubUpdateOutcome,
  type HubUpdateLedger,
  type HubUpdateOutcome,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { ConversationLog } from '../assistant/conversation-log';
import { HUB_AUTHOR, HUB_ORIGIN } from '../assistant/interruption';
import type { Store } from '../store/store';

const OUTCOME_TEXT: Readonly<Record<HubUpdateOutcome, string>> = {
  updated: 'The hub update is complete. The hub and node passed their checks.',
  failed: 'The hub update stopped before installing the new release.',
  reverted: 'The hub update failed. The previous release was restored and passed its checks.',
  unrecoverable:
    'The hub update failed and recovery could not be verified. Check its recovery status.',
};

function postOutcome(store: Store, log: ConversationLog, release: HubUpdateRelease): void {
  const { origin, runId } = release;
  const outcome = hubUpdateOutcome(release);
  if (origin === undefined || outcome === null || store.hubUpdateNotes.has(runId)) return;
  const chat = store.aiChats.find(origin.chatId);
  if (
    chat?.kind !== 'chat' ||
    chat.profile_id !== origin.profileId ||
    store.personAccess.find(origin.profileId)?.role !== 'owner'
  )
    return;
  store.durableWrite(() => {
    if (store.hubUpdateNotes.claim(runId))
      log.note(chat, HUB_AUTHOR, `${OUTCOME_TEXT[outcome]} Run ID: ${runId}`, HUB_ORIGIN);
  });
}

export function reconcileHubUpdateNotes(store: Store, { releases }: HubUpdateLedger): void {
  const log = new ConversationLog(store);
  for (const release of releases) postOutcome(store, log, release);
}
