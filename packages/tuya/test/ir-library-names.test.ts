import { describe, expect, it } from 'vitest';
import {
  UNKNOWN_BRAND,
  libraryOrder,
  mergeBrands,
  modelTitles,
  tidyBrand,
  type PackedModel,
} from '../src';

function packed(
  id: string,
  brand: string,
  models: readonly string[],
  kind: 'keys' | 'climate' = 'keys',
): PackedModel {
  return {
    entry: {
      id,
      source: kind === 'climate' ? 'smartir' : 'flipper-irdb',
      kind,
      category: 'Air conditioner',
      brand,
      models: [...models],
    },
    model: { kind: 'keys', keys: { Power: 'code' } },
  };
}

describe('the IR library names', () => {
  it('trims brands and names the unknown ones once', () => {
    expect(tidyBrand(' Toshiba')).toBe('Toshiba');
    expect(tidyBrand('Mitsubishi_Electric ')).toBe('Mitsubishi Electric');
    expect(tidyBrand('BrandUnknown')).toBe(UNKNOWN_BRAND);
    expect(tidyBrand('Generic_Unknown_Brand')).toBe(UNKNOWN_BRAND);
    expect(tidyBrand('Unknown-brand')).toBe(UNKNOWN_BRAND);
    expect(tidyBrand('')).toBe(UNKNOWN_BRAND);
    expect(tidyBrand('Generic')).toBe('Generic');
  });

  it('drops the brand prefix and file name underscores from models', () => {
    expect(modelTitles('Sharp', 'Air conditioner', ['Sharp_AC_industrial_TB'])).toStrictEqual([
      'AC industrial TB',
    ]);
    expect(modelTitles('Samsung', 'TV', ['Samsung_AA59-00443A'])).toStrictEqual(['AA59-00443A']);
    expect(modelTitles('Sam', 'TV', ['Samsung_AA59'])).toStrictEqual(['Samsung AA59']);
  });

  it('titles a model with no real name after its brand and category', () => {
    expect(modelTitles('Samsung', 'TV', ['Samsung'])).toStrictEqual(['Samsung TV remote']);
    expect(modelTitles('Sharp', 'Air conditioner', ['Sharp_AC_unknownModel'])).toStrictEqual([
      'Sharp air conditioner remote',
    ]);
    expect(modelTitles('Gree', 'Air conditioner', ['Unknown', 'YAA1FB'])).toStrictEqual(['YAA1FB']);
    expect(modelTitles('Sony', 'MiniDisc player', [])).toStrictEqual([
      'Sony MiniDisc player remote',
    ]);
  });

  it('merges brand spellings into the most common one', () => {
    const merged = mergeBrands([
      packed('a', 'GREE', ['A']),
      packed('b', 'Gree', ['B']),
      packed('c', 'Gree', ['C']),
      packed('d', 'MAG', ['D']),
      packed('e', 'Mag', ['E']),
    ]).map(({ entry }) => entry.brand);
    expect(merged).toStrictEqual(['Gree', 'Gree', 'Gree', 'Mag', 'Mag']);
  });

  it('lists full control models before button only ones', () => {
    const sorted = [
      packed('flipper:b', 'Sharp', ['ARC2']),
      packed('smartir:z', 'Sharp', ['FTX10'], 'climate'),
      packed('flipper:a', 'Sharp', ['ARC10']),
      packed('flipper:c', 'Apple', ['X']),
    ]
      .sort(libraryOrder)
      .map(({ entry }) => entry.id);
    expect(sorted).toStrictEqual(['flipper:c', 'smartir:z', 'flipper:b', 'flipper:a']);
  });
});
