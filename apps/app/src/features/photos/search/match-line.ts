import { typedTextOf, type SearchInput } from './query';

export const MATCH_LINE = 'Matched by words, descriptions, meaning and text in photos';

export function matchLineOf(input: SearchInput): string | null {
  return typedTextOf(input) === null ? null : MATCH_LINE;
}
