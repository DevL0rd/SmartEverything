import { storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { assertHeldQueued, type HeldChats } from '../store/repositories/ai-chat-removal-hold';
import type { NewEvent } from '../store/repositories/assistant-events';
import { admitChatExecution } from './native-helpers';
import { type AuthorityScope } from './turn-authority';
import { issueEventAuthority } from './event-authority-issue';

export interface PreviewErrorInput {
  readonly event: NewEvent;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

function previewError(store: HostStore, input: PreviewErrorInput): boolean {
  return store.write(() => {
    if (store.assistantEvents.find(input.event.id) !== undefined) return false;
    admitChatExecution(store.aiChats.chat(input.event.chat_id));
    assertHeldQueued(input.held, input.event.chat_id);
    issueEventAuthority(store, store.assistantEvents.add(input.event), input.scope);
    return true;
  });
}

export interface RequestFinishedInput {
  readonly eventId: string;
  readonly ok: boolean;
}

function requestFinished(store: HostStore, input: RequestFinishedInput): void {
  store.write(() => {
    if (!input.ok) store.aiRepairInbox.markFailed(input.eventId);
    store.assistantEvents.mark(input.eventId, 'answered_at');
  });
}

export const PREVIEW_ERROR_UNIT = storeUnit(previewError);
export const REQUEST_FINISHED_UNIT = storeUnit(requestFinished);
