import { ASSISTANT_NAME_MAX } from '@smarteverything/domain';

const GREETING = /^(?:(?:hey|hi|hello|ok|okay)\b[\s,.!]*)+/i;
const GREETING_WORD = /^(?:hey|hi|hello|ok|okay)$/i;
const PHRASE_END = /[,.!?;:\n]/;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const MAX_WORDS = 2;

function wordsOf(text: string): string {
  return text.replace(EDGE_PUNCTUATION, '').split(/\s+/).slice(0, MAX_WORDS).join(' ');
}

function sameName(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

function isTaken(phrase: string, name: string, aliases: readonly string[]): boolean {
  return sameName(phrase, name) || aliases.some((alias) => sameName(alias, phrase));
}

export function aliasFromHeard(
  heard: string,
  name: string,
  aliases: readonly string[],
): string | null {
  const trimmed = heard.trim();
  const afterGreeting = trimmed.replace(GREETING, '');
  const firstPhrase = afterGreeting.split(PHRASE_END)[0] ?? '';
  const startsWithName =
    afterGreeting !== trimmed || firstPhrase.trim().split(/\s+/).length <= MAX_WORDS;
  const phrase = wordsOf(firstPhrase);
  if (!startsWithName || phrase === '' || phrase.length > ASSISTANT_NAME_MAX) {
    return null;
  }
  return isTaken(phrase, name, aliases) ? null : phrase;
}

export function aliasWordsOf(
  heard: string,
  name: string,
  aliases: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of heard.split(/\s+/)) {
    const word = raw.replace(EDGE_PUNCTUATION, '');
    const key = word.toLocaleLowerCase();
    const skip = word === '' || word.length > ASSISTANT_NAME_MAX || seen.has(key);
    seen.add(key);
    if (!skip && !GREETING_WORD.test(word) && !isTaken(word, name, aliases)) {
      words.push(word);
    }
  }
  return words;
}
