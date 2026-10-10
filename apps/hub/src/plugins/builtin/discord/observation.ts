import type { ObservedMessage } from './context-index';
import type { RawMessage } from './payloads';
import { rawPerson, type Person } from './person';

const MAX_MENTIONS = 20;

export function authorOf(message: Pick<RawMessage, 'author' | 'member'>): Person {
  return rawPerson(message.author, message.member);
}

export function mentionedOf(message: Pick<RawMessage, 'mentions'>): Person[] {
  return message.mentions.slice(0, MAX_MENTIONS).map((user) => rawPerson(user, user.member));
}

export function observe(
  message: RawMessage,
  parentId: string | null,
  contentIntent: boolean,
): ObservedMessage {
  const guildId = message.guild_id ?? null;
  return {
    actorId: message.author.id,
    author: authorOf(message),
    mentions: mentionedOf(message),
    authorBot: message.author.bot === true,
    channelId: message.channel_id,
    guildId,
    messageId: message.id,
    text: message.content,
    timestamp: new Date(message.timestamp).toISOString(),
    contentAvailable: contentIntent || guildId === null || message.content.length > 0,
    parentId,
    replyToId: message.message_reference?.message_id ?? null,
  };
}

export function botNamesOf(identity: {
  readonly application: string | null;
  readonly nicknames: readonly (string | null)[];
  readonly globalName: string | null | undefined;
  readonly username: string | null | undefined;
}): string[] {
  const names = [
    identity.application,
    ...identity.nicknames,
    identity.globalName,
    identity.username,
  ];
  return [
    ...new Set(
      names.filter(
        (name): name is string => name !== null && name !== undefined && name.trim() !== '',
      ),
    ),
  ];
}
