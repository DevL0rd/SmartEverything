import type { SmartRule, SmartRuleLeaf } from '@smarteverything/domain';
import type { PhotoSearch } from '../data';
import { SEARCH_MEDIA, tokenKey, type SearchToken } from './tokens';

export interface SearchInput {
  readonly tokens: readonly SearchToken[];
  readonly text: string;
}

function wordsOf(token: SearchToken): string | null {
  switch (token.kind) {
    case 'place':
    case 'country':
    case 'camera':
    case 'album':
      return token.label;
    case 'date':
    case 'media':
    case 'favourites':
      return null;
  }
}

function textOf(input: SearchInput): string | null {
  const parts = [...input.tokens.map(wordsOf), input.text.trim()].filter(
    (part): part is string => part !== null && part !== '',
  );
  return parts.length === 0 ? null : parts.join(' ');
}

export function searchOf(input: SearchInput): PhotoSearch {
  const date = input.tokens.find((token) => token.kind === 'date');
  const media = input.tokens.find((token) => token.kind === 'media');
  return {
    text: textOf(input),
    starred: input.tokens.some((token) => token.kind === 'favourites') ? true : null,
    duration: null,
    taken: date === undefined ? null : { from: date.from, to: date.to },
    kinds: media === undefined ? SEARCH_MEDIA : [media.media],
  };
}

export function searchKeyOf(input: SearchInput): string {
  return [...input.tokens.map(tokenKey), input.text.trim().toLowerCase()].join('|');
}

export function isSearching(input: SearchInput): boolean {
  return input.tokens.length > 0 || input.text.trim() !== '';
}

function ruleOf(token: SearchToken): SmartRuleLeaf | null {
  switch (token.kind) {
    case 'date':
      return { kind: 'date_range', field: 'takenAt', from: token.from, to: token.to };
    case 'media':
      return { kind: 'item_kind', itemKinds: [token.media] };
    case 'favourites':
      return { kind: 'starred', starred: true };
    case 'camera':
      return { kind: 'text', field: 'camera', contains: token.label };
    case 'place':
    case 'country':
    case 'album':
      return null;
  }
}

export function smartRuleOf(input: SearchInput): SmartRule | null {
  if (input.tokens.length === 0 || input.text.trim() !== '') return null;
  const rules = input.tokens.map(ruleOf);
  if (rules.some((rule) => rule === null)) return null;
  const leaves = rules.filter((rule): rule is SmartRuleLeaf => rule !== null);
  const kinds = leaves.some((rule) => rule.kind === 'item_kind')
    ? leaves
    : [...leaves, { kind: 'item_kind' as const, itemKinds: SEARCH_MEDIA }];
  return { match: 'all', rules: kinds };
}
