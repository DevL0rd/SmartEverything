import type { AiChatRow, MessageQuote } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import type { NewChat } from '../../store/repositories/ai-chat-input';
import {
  assertHeldQueued,
  assertHeldSubagentCreation,
  type HeldChats,
} from '../../store/repositories/ai-chat-removal-hold';
import type { PersonMessage } from '../conversation-log';
import { addPersonMessage } from '../store-units';
import { type AuthorityScope } from '../turn-authority';
import { issueEventAuthority } from '../event-authority-issue';
import { queuedRun } from '../agent-runs/run-units';

export interface RelayPost {
  readonly eventId: string;
  readonly speaker: Pick<PersonMessage, 'author' | 'origin' | 'helperDialogue'>;
  readonly target: AiChatRow;
  readonly source: AiChatRow | null;
  readonly clientId: string | null;
  readonly text: string;
  readonly quote: MessageQuote | null;
  readonly hops: number;
  readonly mirror: PersonMessage | null;
  readonly run: { readonly parent: AiChatRow; readonly now: string } | null;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

function posted(store: HostStore, input: RelayPost): void {
  const { target } = input;
  const row = addPersonMessage(store, {
    ...input.speaker,
    chat: target,
    clientId: input.clientId,
    text: input.text,
    files: [],
    queued: true,
    quote: input.quote,
  });
  assertHeldQueued(input.held, target.id);
  const queued = store.assistantEvents.add({
    id: input.eventId,
    kind: 'chat',
    chat_id: target.id,
    message_id: row.id,
    profile_id: target.profile_id,
    client_id: input.clientId,
    text: input.text,
    report_to: input.source?.id ?? null,
    hops: input.hops,
  });
  issueEventAuthority(store, queued, input.scope);
  if (input.mirror !== null) addPersonMessage(store, input.mirror);
  if (input.run !== null)
    queuedRun(store, {
      parent: input.run.parent,
      child: target,
      eventId: input.eventId,
      task: input.text,
      now: input.run.now,
    });
}

export interface SubagentStart extends Omit<RelayPost, 'target' | 'run' | 'mirror'> {
  readonly child: NewChat;
  readonly tools: readonly string[];
  readonly parent: AiChatRow;
  readonly now: string;
}

function startedSubagent(store: HostStore, input: SubagentStart): AiChatRow {
  return store.write(() => {
    assertHeldSubagentCreation(input.held, input.child);
    const created = store.aiChats.create(input.child);
    const target = store.aiChats.update(created.id, { tools: [...input.tools] });
    posted(store, {
      ...input,
      target,
      mirror: null,
      run: { parent: input.parent, now: input.now },
    });
    return target;
  });
}

export const RELAY_POST_UNIT = storeUnit((store, input: RelayPost): void => {
  store.write(() => {
    posted(store, input);
  });
});
export const SUBAGENT_START_UNIT = storeUnit(startedSubagent);
