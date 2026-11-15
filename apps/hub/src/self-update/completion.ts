import { createHash } from 'node:crypto';
import {
  hubUpdateOutcome,
  type HubUpdateLedger,
  type HubUpdateOrigin,
  type HubUpdateOutcome,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { ConversationLog } from '../assistant/conversation-log';
import { HUB_AUTHOR, HUB_ORIGIN } from '../assistant/interruption';
import { repairWorkClaims } from '../store/repositories/repair-work-claims';
import type { Store } from '../store/store';

const OUTCOME_TEXT: Readonly<Record<HubUpdateOutcome, string>> = {
  updated: 'The hub update is complete. The hub and node passed their checks.',
  failed: 'The hub update stopped before installing the new release.',
  kept: 'The owner kept the failed hub update as it is. Nothing was rolled back and the backup is kept.',
  reverted:
    'The owner rolled the hub update back. The previous release was restored and passed its checks.',
  unrecoverable:
    'The hub update rollback could not be verified. The backup is kept. Check its status before deciding again.',
};

const DECISION_TEXT =
  'The hub update failed and waits for your decision. Its backup is kept and nothing was rolled back. With update_control, rollback restores the previous release, recover tries this release again, or keep it as it is, which makes the update finished while its backup stays. The details are in update_control status.';

function ownerChat(store: Store, origin: HubUpdateOrigin): ReturnType<Store['aiChats']['find']> {
  const chat = store.aiChats.find(origin.chatId);
  return chat?.kind === 'chat' &&
    chat.profile_id === origin.profileId &&
    store.personAccess.find(origin.profileId)?.role === 'owner'
    ? chat
    : undefined;
}

function postOnce(
  store: Store,
  log: ConversationLog,
  target: { readonly origin: HubUpdateOrigin; readonly key: string; readonly text: string },
): void {
  if (store.hubUpdateNotes.has(target.key)) return;
  const chat = ownerChat(store, target.origin);
  if (chat === undefined) return;
  store.durableWrite(() => {
    if (store.hubUpdateNotes.claim(target.key)) log.note(chat, HUB_AUTHOR, target.text, HUB_ORIGIN);
  });
}

function postOutcome(store: Store, log: ConversationLog, release: HubUpdateRelease): void {
  const { origin, runId } = release;
  const outcome = hubUpdateOutcome(release);
  if (origin === undefined || outcome === null) return;
  postOnce(store, log, { origin, key: runId, text: `${OUTCOME_TEXT[outcome]} Run ID: ${runId}` });
}

function decisionRecipients(store: Store, release: HubUpdateRelease): readonly HubUpdateOrigin[] {
  const now = store.now().toISOString();
  const claimed = repairWorkClaims(store.settingsKv)
    .filter((claim) => claim.component === 'hub.service' && claim.expiresAt > now)
    .map(({ chatId, profileId }) => ({ chatId, profileId }));
  const all = release.origin === undefined ? claimed : [release.origin, ...claimed];
  return all.filter(
    (origin, index) => all.findIndex((other) => other.chatId === origin.chatId) === index,
  );
}

function decisionNoteId(runId: string, revision: number, chatId: string): string {
  const hex = createHash('sha256')
    .update(`${runId}:decision:${String(revision)}:${chatId}`)
    .digest('hex');
  const variant = ((Number.parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function postDecision(store: Store, log: ConversationLog, release: HubUpdateRelease): void {
  if (release.phase !== 'awaiting_decision') return;
  const { runId, revision } = release;
  for (const origin of decisionRecipients(store, release))
    postOnce(store, log, {
      origin,
      key: decisionNoteId(runId, revision, origin.chatId),
      text: `${DECISION_TEXT} Run ID: ${runId}`,
    });
}

export function reconcileHubUpdateNotes(store: Store, { releases }: HubUpdateLedger): void {
  const log = new ConversationLog(store);
  for (const release of releases) {
    postOutcome(store, log, release);
    postDecision(store, log, release);
  }
}
