import { z } from 'zod';
import { PHOTO_LABEL } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

const DAY = z.iso.date();

export const SEARCH_MEDIA = ['image', 'video'] as const;

export type SearchMedia = (typeof SEARCH_MEDIA)[number];

export const SEARCH_TOKEN = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('place'), placeId: z.int(), label: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('country'),
    countryCode: z.string().length(2),
    label: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('date'), from: DAY, to: DAY, label: z.string().min(1) }),
  z.strictObject({
    kind: z.literal('media'),
    media: z.enum(SEARCH_MEDIA),
    label: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal('camera'), label: z.string().min(1) }),
  z.strictObject({ kind: z.literal('album'), albumId: z.uuid(), label: z.string().min(1) }),
  z.strictObject({ kind: z.literal('favourites'), label: z.string().min(1) }),
  z.strictObject({ kind: z.literal('person'), groupId: z.uuid(), label: z.string().min(1) }),
  z.strictObject({ kind: z.literal('pet'), groupId: z.uuid(), label: z.string().min(1) }),
  z.strictObject({ kind: z.literal('thing'), label: PHOTO_LABEL }),
  z.strictObject({
    kind: z.literal('photoText'),
    text: z.string().trim().min(1),
    label: z.string().min(1),
  }),
]);

export type SearchToken = z.infer<typeof SEARCH_TOKEN>;

export type SearchTokenKind = SearchToken['kind'];

const SINGLE: ReadonlySet<SearchTokenKind> = new Set(['date', 'media', 'favourites', 'photoText']);

export const TOKEN_ICON: Readonly<Record<SearchTokenKind, IconName>> = {
  place: 'mapPin',
  country: 'mapPin',
  date: 'calendar',
  media: 'film',
  camera: 'camera',
  album: 'layers',
  favourites: 'star',
  person: 'user',
  pet: 'dog',
  thing: 'sparkles',
  photoText: 'textCursor',
};

export function tokenIconOf(token: SearchToken): IconName {
  if (token.kind === 'media') return token.media === 'video' ? 'film' : 'image';
  return TOKEN_ICON[token.kind];
}

const SMART_KINDS: ReadonlySet<SearchTokenKind> = new Set(['person', 'pet', 'thing', 'photoText']);

export type SmartToken = Extract<SearchToken, { kind: 'person' | 'pet' | 'thing' | 'photoText' }>;

export type BaseToken = Exclude<SearchToken, SmartToken>;

export function isSmartToken(token: SearchToken): token is SmartToken {
  return SMART_KINDS.has(token.kind);
}

export function tokenKey(token: SearchToken): string {
  return isSmartToken(token) ? smartKeyOf(token) : baseKeyOf(token);
}

function baseKeyOf(token: BaseToken): string {
  switch (token.kind) {
    case 'place':
      return `place:${String(token.placeId)}`;
    case 'country':
      return `country:${token.countryCode}`;
    case 'date':
      return `date:${token.from}:${token.to}`;
    case 'media':
      return `media:${token.media}`;
    case 'camera':
      return `camera:${token.label.toLowerCase()}`;
    case 'album':
      return `album:${token.albumId}`;
    case 'favourites':
      return 'favourites';
  }
}

function smartKeyOf(token: SmartToken): string {
  switch (token.kind) {
    case 'person':
    case 'pet':
      return `group:${token.groupId}`;
    case 'thing':
      return `thing:${token.label.toLowerCase()}`;
    case 'photoText':
      return `text:${token.text.toLowerCase()}`;
  }
}

export function hasToken(tokens: readonly SearchToken[], token: SearchToken): boolean {
  const key = tokenKey(token);
  return tokens.some((held) => tokenKey(held) === key);
}

export function addToken(
  tokens: readonly SearchToken[],
  token: SearchToken,
): readonly SearchToken[] {
  if (hasToken(tokens, token)) return tokens;
  const kept = SINGLE.has(token.kind) ? tokens.filter((held) => held.kind !== token.kind) : tokens;
  return [...kept, token];
}

export function removeToken(
  tokens: readonly SearchToken[],
  token: SearchToken,
): readonly SearchToken[] {
  const key = tokenKey(token);
  return tokens.filter((held) => tokenKey(held) !== key);
}

export function removeLastToken(tokens: readonly SearchToken[]): readonly SearchToken[] {
  return tokens.slice(0, -1);
}

export function searchTitleOf(tokens: readonly SearchToken[], text: string): string {
  const words = text.trim();
  return [...tokens.map((token) => token.label), ...(words === '' ? [] : [words])].join(' · ');
}
