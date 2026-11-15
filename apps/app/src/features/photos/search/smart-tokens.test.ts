import type { PhotoSuggestions } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { localItemsForScope } from '../local/tiles';
import { scopeOf } from '../model/library-scope';
import { tabById } from '../model/library-tabs';
import { MATCH_LINE, matchLineOf } from './match-line';
import { smartRuleOf } from './query';
import { SEARCH_TOKEN, addToken, tokenIconOf, tokenKey, type SearchToken } from './tokens';
import { suggestionsOf, type SearchSources } from './suggest';

const ANNA_ID = '6b9e1d1a-8f6e-4a43-9a1c-0e4a3c1f2b11';
const REX_ID = '7b9e1d1a-8f6e-4a43-9a1c-0e4a3c1f2b11';
const ANNA: SearchToken = { kind: 'person', groupId: ANNA_ID, label: 'Anna' };
const REX: SearchToken = { kind: 'pet', groupId: REX_ID, label: 'Rex' };
const DOG: SearchToken = { kind: 'thing', label: 'dog' };
const MENU: SearchToken = { kind: 'photoText', text: 'menu', label: 'Text “menu”' };
const WIFI: SearchToken = { kind: 'photoText', text: 'wifi', label: 'Text “wifi”' };

const SOURCES: SearchSources = {
  countries: [],
  albums: [],
  cameras: [],
  photos: null,
  videos: null,
  favourites: null,
  dates: { today: '2026-11-14', southern: false, months: new Map() },
};

const HITS: PhotoSuggestions = {
  people: [{ groupId: ANNA_ID, name: 'Anna', coverFaceId: ANNA_ID, coverItemId: 'i1', count: 12 }],
  pets: [],
  things: [{ label: 'anchor', count: 3 }],
  text: [{ itemId: 'i2', snippet: 'an old shop sign' }],
};

describe('people, pets, things and text tokens', () => {
  it('parse, key and pick icons', () => {
    expect(SEARCH_TOKEN.parse(ANNA)).toEqual(ANNA);
    expect(SEARCH_TOKEN.safeParse({ kind: 'thing', label: 'a, b' }).success).toBe(false);
    expect([ANNA, REX, DOG, MENU].map(tokenKey)).toEqual([
      `group:${ANNA_ID}`,
      `group:${REX_ID}`,
      'thing:dog',
      'text:menu',
    ]);
    expect([ANNA, REX, DOG, MENU].map(tokenIconOf)).toEqual([
      'user',
      'dog',
      'sparkles',
      'textCursor',
    ]);
  });

  it('keep many people and things but one text in photo', () => {
    expect(addToken(addToken([ANNA, DOG], REX), MENU)).toEqual([ANNA, DOG, REX, MENU]);
    expect(addToken([MENU], WIFI)).toEqual([WIFI]);
  });

  it('narrow the hub scope and send typed words as meaning', () => {
    expect(scopeOf(tabById('all'), { tokens: [ANNA, REX, DOG, MENU], text: ' red car ' })).toEqual({
      kind: 'hub',
      scope: {
        filter: 'all',
        groupIds: [ANNA_ID, REX_ID],
        labels: ['dog'],
        photoText: 'menu',
        meaning: 'red car',
      },
      unused: [],
    });
  });

  it('are not used on the camera and device tabs and never make a smart album', () => {
    expect(scopeOf(tabById('cameras'), { tokens: [ANNA], text: '' }).unused).toEqual([ANNA]);
    expect(smartRuleOf({ tokens: [ANNA], text: '' })).toBeNull();
  });

  it('keep photos on this device out of a people, things or text search', () => {
    const item = {
      id: 'local-1',
      name: 'IMG_red_car.jpg',
      takenAt: new Date('2026-07-04T12:00:00').getTime(),
      modificationTime: 1,
      width: 4,
      height: 3,
      video: false,
      durationMs: null,
      folder: null,
    };
    const pick = (scope: Parameters<typeof localItemsForScope>[1]): number =>
      localItemsForScope([item], scope, [], new Set()).length;
    expect(pick({ filter: 'all', meaning: 'red' })).toBe(1);
    expect(pick({ filter: 'all', meaning: 'blue' })).toBe(0);
    expect(pick({ filter: 'all', groupIds: [ANNA_ID] })).toBe(0);
    expect(pick({ filter: 'all', labels: ['dog'] })).toBe(0);
    expect(pick({ filter: 'all', photoText: 'menu' })).toBe(0);
  });
});

describe('smart suggestions', () => {
  it('lead with people and add things and text from the hub', () => {
    const groups = suggestionsOf('an', SOURCES, [], {
      suggestions: HITS,
      boxes: new Map([[ANNA_ID, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]]),
    });
    expect(groups.map((group) => group.id)).toEqual(['people', 'things', 'text']);
    expect(groups[0]?.items[0]).toEqual({
      token: ANNA,
      count: 12,
      face: { itemId: 'i1', box: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, kind: 'person' },
    });
    expect(groups[1]?.items[0]?.token).toEqual({ kind: 'thing', label: 'anchor' });
    expect(groups[2]?.items[0]).toEqual({
      token: { kind: 'photoText', text: 'an', label: 'Text “an”' },
      count: null,
      detail: 'an old shop sign',
    });
  });

  it('drop what is already a token', () => {
    const groups = suggestionsOf('an', SOURCES, [ANNA], { suggestions: HITS, boxes: new Map() });
    expect(groups.map((group) => group.id)).toEqual(['things', 'text']);
  });

  it('say how typed words matched', () => {
    expect(matchLineOf({ tokens: [ANNA], text: '' })).toBeNull();
    expect(matchLineOf({ tokens: [], text: 'beach' })).toBe(MATCH_LINE);
  });
});
