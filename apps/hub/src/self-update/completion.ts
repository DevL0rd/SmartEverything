import { createHash } from 'node:crypto';
import {
  hubUpdateOutcome,
  type HubUpdateLedger,
  type HubUpdateOrigin,
  type HubUpdateOutcome,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { HUB_AUTHOR, HUB_ORIGIN } from '../assistant/interruption';
import { noteMessage } from '../assistant/note-message';
import { addConversationMessage } from '../assistant/store-units';
import { durableStoreUnit } from '../store/host/unit';
import { repairWorkClaims } from '../store/repositories/repair-work-claims';
import type { Store } from '../store/store';
import type { HostStore } from '../store/host/host-store';

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

function ownerChat(
  store: HostStore,
  origin: HubUpdateOrigin,
): ReturnType<HostStore['aiChats']['find']> {
  const chat = store.aiChats.find(origin.chatId);
  return chat?.kind === 'chat' &&
    chat.profile_id === origin.profileId &&
    store.personAccess.find(origin.profileId)?.role === 'owner'
    ? chat
    : undefined;
}

function postOnce(
  store: HostStore,
  target: { readonly origin: HubUpdateOrigin; readonly key: string; readonly text: string },
): void {
  if (store.hubUpdateNotes.has(target.key)) return;
  const chat = ownerChat(store, target.origin);
  if (chat === undefined) return;
  if (store.hubUpdateNotes.claim(target.key))
    addConversationMessage(store, {
      row: noteMessage(chat, HUB_AUTHOR, target.text, HUB_ORIGIN),
      files: [],
    });
}

function postOutcome(store: HostStore, release: HubUpdateRelease): void {
  const { origin, runId } = release;
  const outcome = hubUpdateOutcome(release);
  if (origin === undefined || outcome === null) return;
  postOnce(store, { origin, key: runId, text: `${OUTCOME_TEXT[outcome]} Run ID: ${runId}` });
}

function decisionRecipients(
  store: HostStore,
  release: HubUpdateRelease,
): readonly HubUpdateOrigin[] {
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

function postDecision(store: HostStore, release: HubUpdateRelease): void {
  if (release.phase !== 'awaiting_decision') return;
  const { runId, revision } = release;
  for (const origin of decisionRecipients(store, release))
    postOnce(store, {
      origin,
      key: decisionNoteId(runId, revision, origin.chatId),
      text: `${DECISION_TEXT} Run ID: ${runId}`,
    });
}

export const HUB_UPDATE_NOTES_UNIT = durableStoreUnit(
  (store, { releases }: HubUpdateLedger): void => {
    for (const release of releases) {
      postOutcome(store, release);
      postDecision(store, release);
    }
  },
);

export function reconcileHubUpdateNotes(
  store: Pick<Store, 'host'>,
  ledger: HubUpdateLedger,
): Promise<void> {
  return store.host.write('hubUpdateNotes', ledger);
}
