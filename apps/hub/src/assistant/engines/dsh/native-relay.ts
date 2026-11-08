import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DSH_SESSION_ID, HELPER_DIALOGUE_KIND } from '@smarteverything/domain';
import type {
  AiChatRow,
  DshSessionEvent,
  DshSessionMetadata,
  HelperDialogue,
} from '@smarteverything/domain';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';

const TEXT = z.object({ type: z.literal('text'), text: z.string() });
const RELAY = z.object({
  id: z.uuid(),
  content: z.array(z.unknown()),
  source: z.strictObject({
    kind: z.literal('agent-message'),
    form: z.literal('relay'),
    senderSessionId: DSH_SESSION_ID,
  }),
});
const INBOX = z.object({ inserted: z.array(z.unknown()) });
const REPLAY = z.object({ historyReplay: z.literal(true) });

interface Relay {
  readonly id: string;
  readonly sender: string;
  readonly text: string;
}

interface Pair {
  readonly parent: AiChatRow;
  readonly helper: AiChatRow;
  readonly direction: 'to_helper' | 'from_helper';
}

export function nativeRelay(data: unknown): Relay | undefined {
  const message = RELAY.safeParse(data);
  if (!message.success) return undefined;
  const { id, source, content } = message.data;
  const sender = source.senderSessionId;
  const [wrapper, ...body] = content;
  const envelope = TEXT.safeParse(wrapper);
  if (!envelope.success || envelope.data.text !== `Agent ${sender} sent a message: `)
    return undefined;
  const text = body
    .flatMap((block) => {
      const part = TEXT.safeParse(block);
      return part.success ? [part.data.text] : [];
    })
    .join('');
  return text.trim() === '' ? undefined : { id, sender, text };
}

function boundChat(store: Store, metadata: DshSessionMetadata): AiChatRow | undefined {
  const chat = store.aiChats.find(metadata.chat_id);
  return chat?.profile_id === metadata.profile_id &&
    chat.engine.kind === 'dsh' &&
    chat.engine.session_id === metadata.header.id
    ? chat
    : undefined;
}

function directChild(
  parent: AiChatRow,
  child: AiChatRow,
  childSession: DshSessionMetadata,
  parentSessionId: string,
): boolean {
  const { header } = childSession;
  return (
    child.kind === 'subagent' &&
    child.parent_id === parent.id &&
    child.profile_id === parent.profile_id &&
    header.origin === 'subagent' &&
    header.parentSession === parentSessionId
  );
}

function directPair(
  store: Store,
  recipient: DshSessionMetadata,
  senderId: string,
): Pair | undefined {
  const sender = store.dshSessions.ownerOf(senderId);
  if (sender?.profile_id !== recipient.profile_id) return undefined;
  const from = boundChat(store, sender);
  const to = boundChat(store, recipient);
  if (from === undefined || to === undefined) return undefined;
  if (directChild(from, to, recipient, senderId))
    return { parent: from, helper: to, direction: 'to_helper' };
  if (directChild(to, from, sender, recipient.header.id))
    return { parent: to, helper: from, direction: 'from_helper' };
  return undefined;
}

function outgoingId(parentId: string, deliveryId: string): string {
  const hex = createHash('sha256')
    .update(`dsh-helper-relay:${parentId}:${deliveryId}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function candidates(event: DshSessionEvent): readonly unknown[] {
  if (REPLAY.safeParse(event.data).success) return [];
  if (event.type === 'user/message' && event.surfaceOp === 'append') return [event.data];
  if (event.type !== 'agent/inbox/spliced') return [];
  const inbox = INBOX.safeParse(event.data);
  return inbox.success ? inbox.data.inserted : [];
}

function project(
  store: Store,
  conversation: ConversationLog,
  session: DshSessionMetadata,
  message: Relay,
): void {
  const pair = directPair(store, session, message.sender);
  if (pair === undefined) return;
  const { parent, helper, direction } = pair;
  const helperName = helper.helper_name;
  if (helperName === null) return;
  const messageId = direction === 'from_helper' ? message.id : outgoingId(parent.id, message.id);
  if (store.assistantChat.find(messageId) !== undefined) return;
  const helperDialogue: HelperDialogue = {
    kind: HELPER_DIALOGUE_KIND,
    direction,
    helper_chat_id: helper.id,
    helper_name: helperName,
  };
  if (direction === 'from_helper') {
    conversation.responderInChat({
      chat: parent,
      replyTo: null,
      messageId,
      text: message.text,
      helperDialogue,
    });
    return;
  }
  conversation.person({
    chat: parent,
    clientId: null,
    author: parent.title,
    text: message.text,
    files: [],
    origin: { source: 'chat', plugin_id: null, device_id: null, name: parent.title },
    messageId,
    helperDialogue,
  });
}

export function watchNativeRelay(store: Store, conversation: ConversationLog): void {
  store.dshSessions.admitAppend((id, events) => {
    const session = store.dshSessions.ownerOf(id);
    if (session === undefined) return;
    for (const event of events) {
      if (event.seq < session.next_seq || event.seq < session.inherited_event_count) continue;
      for (const candidate of candidates(event)) {
        const message = nativeRelay(candidate);
        if (message !== undefined) project(store, conversation, session, message);
      }
    }
  });
}
