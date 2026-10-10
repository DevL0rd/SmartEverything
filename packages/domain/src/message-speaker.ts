import type { AssistantMessageRow } from './assistant';
import type { MessageSource } from './ai-chats';

export const MESSAGE_SPEAKER_KINDS = ['me', 'person', 'ai', 'system'] as const;

export type MessageSpeakerKind = (typeof MESSAGE_SPEAKER_KINDS)[number];

export interface MessageSpeaker {
  readonly kind: MessageSpeakerKind;
  readonly name: string;
  readonly via: MessageSource | null;
  readonly pluginId: string | null;
}

const OWN_SOURCES: ReadonlySet<MessageSource> = new Set<MessageSource>(['app', 'voice']);

function isPerson(message: Pick<AssistantMessageRow, 'origin'>): boolean {
  const { origin } = message;
  if (origin === null) {
    return false;
  }
  if (origin.source === 'plugin') {
    return origin.requester !== 'owner';
  }
  return !OWN_SOURCES.has(origin.source);
}

function kindOf(message: Pick<AssistantMessageRow, 'role' | 'origin'>): MessageSpeakerKind {
  if (message.role === 'responder') {
    return 'ai';
  }
  if (message.role === 'system') {
    return 'system';
  }
  return isPerson(message) ? 'person' : 'me';
}

export function messageSpeaker(
  message: Pick<AssistantMessageRow, 'role' | 'author' | 'origin'>,
): MessageSpeaker {
  return {
    kind: kindOf(message),
    name: message.author,
    via: message.origin?.source ?? null,
    pluginId: message.origin?.plugin_id ?? null,
  };
}
