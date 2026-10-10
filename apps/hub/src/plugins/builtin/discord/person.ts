import { z } from 'zod';
import { SNOWFLAKE, USER_MENTION } from './ids';
import type { RawMember, RawUser } from './payloads';

const NAME_LENGTH = 100;

const nameText = z.string().max(NAME_LENGTH).nullable();

export const PERSON = z.strictObject({
  id: SNOWFLAKE,
  username: nameText,
  globalName: nameText,
  nickname: nameText,
});

export type Person = z.output<typeof PERSON>;

function clean(value: string | null | undefined): string | null {
  const text = (value ?? '')
    .replace(/[\p{Cc}\p{Cf}"`]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_LENGTH);
  return text === '' ? null : text;
}

export function cleanName(value: string): string {
  return clean(value) ?? '';
}

export function person(
  id: string,
  username?: string | null,
  globalName?: string | null,
  nickname?: string | null,
): Person {
  return {
    id,
    username: clean(username),
    globalName: clean(globalName),
    nickname: clean(nickname),
  };
}

export function rawPerson(user: RawUser, member?: Pick<RawMember, 'nick'> | null): Person {
  return person(user.id, user.username, user.global_name, member?.nick);
}

export function displayName(who: Person): string {
  return who.nickname ?? who.globalName ?? who.username ?? 'unknown name';
}

export function describePerson(who: Person): string {
  const display = displayName(who);
  const handle = who.username !== null && who.username !== display ? ` @${who.username}` : '';
  return `"${display}"${handle} (ID ${who.id})`;
}

export function readableText(text: string, mentions: readonly Person[] = []): string {
  return text.replace(USER_MENTION, (raw: string, id: string) => {
    const found = mentions.find((item) => item.id === id);
    return found === undefined ? raw : `@${displayName(found)}`;
  });
}

function mentionNote(text: string, mentions: readonly Person[] = []): string {
  const ids = new Set([...text.matchAll(USER_MENTION)].map((match) => match[1]));
  const named = mentions.filter((item) => ids.has(item.id));
  return named.length === 0
    ? ''
    : `Mentioned: ${named.map((item) => `@${displayName(item)} = ID ${item.id}`).join(', ')}`;
}

export function spoken(text: string, mentions: readonly Person[] = []): string {
  const note = mentionNote(text, mentions);
  return note === '' ? readableText(text, mentions) : `${readableText(text, mentions)} [${note}]`;
}
