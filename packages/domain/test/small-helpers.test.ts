import { describe, expect, it } from 'vitest';
import { matchesModelSearchWords } from '../src/ai-model-search';
import { isSampledCapability } from '../src/capabilities';
import { appendTo, chunk } from '../src/chunk';
import { defaultAmount, factsOf, portionLabel } from '../src/food-entries';
import type { FoodCandidate, FoodRow } from '../src/foods';
import { placeLabel, shortPlaceLabel } from '../src/places';
import { xiaomiRegionFor } from '../src/providers-info';
import {
  shellyComponentCapability,
  shellyPresenceExternalId,
  shellyZoneExternalId,
} from '../src/shelly-presence-pages';

const FOOD: FoodCandidate = {
  name: 'Soup',
  brand: null,
  barcode: null,
  kind: 'food',
  basis: { amount: 100, unit: 'g' },
  serving: { amount: 250, label: '1 bowl' },
  kcal: 40,
  grams: {},
  water_percent: 80,
};

describe('chunk and appendTo', () => {
  it('splits arrays and strings into pieces of a size, the last one shorter', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toStrictEqual([[1, 2], [3, 4], [5]]);
    expect(chunk('abcde', 3)).toStrictEqual(['abc', 'de']);
    expect(chunk([], 3)).toStrictEqual([]);
  });

  it('starts a group on the first item and grows it on the next', () => {
    const groups = new Map<string, number[]>();
    appendTo(groups, 'a', 1);
    appendTo(groups, 'a', 2);
    appendTo(groups, 'b', 3);
    expect([...groups]).toStrictEqual([
      ['a', [1, 2]],
      ['b', [3]],
    ]);
  });
});

describe('places', () => {
  it('joins the name, region and country, skipping a region that repeats the name', () => {
    expect(placeLabel({ name: 'Berlin', region: 'Berlin', country: 'Germany' })).toBe(
      'Berlin, Germany',
    );
    expect(placeLabel({ name: 'Leeds', region: 'England', country: 'UK' })).toBe(
      'Leeds, England, UK',
    );
    expect(placeLabel({ name: 'Atlantis', region: null, country: null })).toBe('Atlantis');
  });

  it('shortens to the name and country', () => {
    expect(shortPlaceLabel({ name: 'Leeds', country: 'UK' })).toBe('Leeds, UK');
    expect(shortPlaceLabel({ name: 'Atlantis', country: null })).toBe('Atlantis');
  });
});

describe('xiaomiRegionFor', () => {
  it.each([
    ['Asia/Shanghai', 'cn'],
    ['PRC', 'cn'],
    ['Europe/Moscow', 'ru'],
    ['Asia/Vladivostok', 'ru'],
    ['Asia/Kolkata', 'i2'],
    ['Europe/Berlin', 'de'],
    ['Atlantic/Reykjavik', 'de'],
    ['America/New_York', 'us'],
    ['Pacific/Honolulu', 'us'],
    ['Asia/Singapore', 'sg'],
    ['Australia/Sydney', 'sg'],
  ] as const)('puts %s in %s', (zone, region) => {
    expect(xiaomiRegionFor(zone)).toBe(region);
  });
});

describe('model search words', () => {
  const model = { id: 'openai/gpt-6', name: 'GPT Six', author_name: 'OpenAI' };

  it('needs every word to appear in the name, author or id, in any case', () => {
    expect(matchesModelSearchWords(model, 'gpt six')).toBe(true);
    expect(matchesModelSearchWords(model, '  OPENAI   six ')).toBe(true);
    expect(matchesModelSearchWords(model, 'gpt seven')).toBe(false);
  });

  it('matches every model for an empty query', () => {
    expect(matchesModelSearchWords(model, '   ')).toBe(true);
  });
});

describe('sampled capabilities', () => {
  it('is true only for catalogued capabilities marked as sampled', () => {
    expect(isSampledCapability('latency')).toBe(true);
    expect(isSampledCapability('power')).toBe(false);
    expect(isSampledCapability('raw:custom')).toBe(false);
  });
});

describe('food entry helpers', () => {
  it('copies only the facts of a stored food', () => {
    const row: FoodRow = {
      ...FOOD,
      id: '3a000000-0000-4000-8000-0000000000a1',
      profile_id: '3a000000-0000-4000-8000-0000000000b1',
      origin: 'custom',
      favourite: false,
      last_used_at: null,
      created_at: '2026-10-08T07:00:00Z',
      updated_at: '2026-10-08T07:00:00Z',
    };
    expect(factsOf(row)).toStrictEqual(FOOD);
  });

  it('starts at a serving, else 250 for a drink and 100 for a food', () => {
    expect(defaultAmount(FOOD)).toBe(250);
    expect(defaultAmount({ ...FOOD, serving: null })).toBe(100);
    expect(defaultAmount({ ...FOOD, serving: null, kind: 'drink' })).toBe(250);
  });

  it('labels a portion as the serving, a multiple of it, or the plain amount', () => {
    expect(portionLabel(FOOD, 250)).toBe('1 bowl');
    expect(portionLabel(FOOD, 500)).toBe('2 × 1 bowl');
    expect(portionLabel(FOOD, 375)).toBe('375 g');
    expect(portionLabel({ ...FOOD, serving: null, basis: { amount: 100, unit: 'ml' } }, 12.5)).toBe(
      '12.5 ml',
    );
  });
});

describe('shelly presence ids', () => {
  it('builds capability and external ids', () => {
    expect(shellyComponentCapability('presence:0')).toBe('raw:shelly.component.presence:0');
    expect(shellyPresenceExternalId('abc')).toBe('shelly-presence:abc');
  });

  it('adds the generation to a zone id only after the first', () => {
    expect(shellyZoneExternalId('abc', 2, 0)).toBe('shelly-presence:abc:presencezone:2');
    expect(shellyZoneExternalId('abc', 2, 3)).toBe(
      'shelly-presence:abc:presencezone:2:generation:3',
    );
  });
});
