import { randomUUID } from 'node:crypto';
import { PLUGIN_ORIGIN, type PluginOrigin } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { HostStore } from '../../store/host/host-store';
import { storeUnit } from '../../store/host/unit';
import { assertHeldQueued, type HeldChats } from '../../store/repositories/ai-chat-removal-hold';
import { withAuthoritySource, type AuthorityScope } from '../turn-authority';
import { issueEventAuthority } from '../event-authority-issue';
import { relaySpeaker } from './relay-speaker';
import { addConversationMessage, addPersonMessage } from '../store-units';
import { noteMessage } from '../note-message';

function claim(store: HostStore, eventId: string, destination: 'parent' | 'waiter'): boolean {
  const run = store.aiAgentRuns.find(eventId);
  return run === undefined || store.aiAgentRuns.claimDelivery(run.id, destination);
}

function pluginOf(store: HostStore, event: StoredEvent): PluginOrigin | null {
  const origin =
    event.message_id === null ? null : store.assistantChat.message(event.message_id).origin;
  const parsed = PLUGIN_ORIGIN.safeParse({
    plugin_id: origin?.plugin_id,
    requester: origin?.requester,
  });
  return parsed.success ? parsed.data : null;
}

export interface Report {
  readonly event: StoredEvent;
  readonly text: string;
  readonly ok: boolean;
  readonly assistant: string;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

function report(store: HostStore, input: Report, reportTo: string): void {
  const { event, text, ok } = input;
  const from = store.aiChats.chat(event.chat_id);
  const target = store.aiChats.chat(reportTo);
  const hops = event.hops + 1;
  const body = ok ? text : `It could not finish: ${text}`;
  const speaker = relaySpeaker(input.assistant, { from, to: target }, hops, pluginOf(store, event));
  const row =
    speaker.helperDialogue === undefined || body.trim() === ''
      ? addConversationMessage(store, {
          row: noteMessage(target, speaker.author, body, speaker.origin),
          files: [],
        })
      : addPersonMessage(store, {
          ...speaker,
          chat: target,
          clientId: null,
          text: body,
          files: [],
        });
  assertHeldQueued(input.held, target.id);
  const added = store.assistantEvents.add({
    id: randomUUID(),
    kind: 'report',
    chat_id: target.id,
    message_id: row.id,
    profile_id: target.profile_id,
    client_id: event.client_id,
    text: body,
    hops,
  });
  issueEventAuthority(
    store,
    added,
    withAuthoritySource(input.scope, store.harnessRecovery.latestAuthority(from.id)),
  );
}

export const DELEGATION_CLAIM_UNIT = storeUnit(
  (store, input: { readonly eventId: string; readonly destination: 'parent' | 'waiter' }) =>
    claim(store, input.eventId, input.destination),
);

export const DELEGATION_REPORT_UNIT = storeUnit((store, input: Report): boolean => {
  if (!claim(store, input.event.id, 'parent') || input.event.report_to === null) return false;
  report(store, input, input.event.report_to);
  return true;
});
