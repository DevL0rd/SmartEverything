import type { SpeechTrigger } from '@smarteverything/domain';
const WORDS = new Intl.Segmenter('und', { granularity: 'word' });
export function speechWords(text: string, caseSensitive: boolean): readonly string[] {
  const normalized = text.normalize('NFC');
  const value = caseSensitive ? normalized : normalized.toLowerCase();
  return [...WORDS.segment(value)]
    .filter((part) => part.isWordLike === true)
    .map((part) => part.segment);
}
export function speechPhraseMatches(
  trigger: Pick<SpeechTrigger, 'phrase' | 'caseSensitive'>,
  text: string,
): boolean {
  const phrase = speechWords(trigger.phrase, trigger.caseSensitive);
  const spoken = speechWords(text, trigger.caseSensitive);
  return (
    phrase.length > 0 &&
    spoken.some((_word, start) => phrase.every((word, offset) => spoken[start + offset] === word))
  );
}
