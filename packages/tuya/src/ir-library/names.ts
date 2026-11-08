import type { PackedModel } from './pack';

export const UNKNOWN_BRAND = 'Unknown brand';

const UNKNOWN_BRAND_WORDS = new Set(['brand', 'unknown', 'generic']);

const PLACEHOLDER_WORDS = new Set(['unknown', 'model', 'remote', 'generic', 'ac', 'tv']);

function wordsOf(name: string): string[] {
  return name
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word !== '');
}

export function tidyName(raw: string): string {
  return raw.replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
}

export function tidyBrand(raw: string): string {
  const name = tidyName(raw);
  const words = wordsOf(name);
  const unknown =
    words.length === 0 ||
    (words.includes('unknown') && words.every((word) => UNKNOWN_BRAND_WORDS.has(word)));
  return unknown ? UNKNOWN_BRAND : name;
}

function withoutBrand(name: string, brand: string): string {
  const rest = name.slice(brand.length);
  const prefixed = name.toLowerCase().startsWith(brand.toLowerCase()) && /^([\s-]|$)/.test(rest);
  return prefixed ? rest.replace(/^[\s-]+/, '') : name;
}

function placeholder(name: string): boolean {
  return wordsOf(name).every((word) => PLACEHOLDER_WORDS.has(word));
}

function categoryWords(category: string): string {
  return category
    .split(' ')
    .map((word) => (word.slice(1) === word.slice(1).toLowerCase() ? word.toLowerCase() : word))
    .join(' ');
}

export function modelTitles(brand: string, category: string, raw: readonly string[]): string[] {
  const named = raw
    .map((name) => withoutBrand(tidyName(name), brand))
    .filter((name) => !placeholder(name));
  const unique = [...new Set(named)];
  return unique.length === 0 ? [`${brand} ${categoryWords(category)} remote`] : unique;
}

function uppercaseCount(name: string): number {
  return (name.match(/\p{Lu}/gu) ?? []).length;
}

function preferredSpellings(models: readonly PackedModel[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  models.forEach(({ entry }) => {
    const key = entry.brand.toLowerCase();
    const spellings = counts.get(key) ?? new Map<string, number>();
    spellings.set(entry.brand, (spellings.get(entry.brand) ?? 0) + 1);
    counts.set(key, spellings);
  });
  return new Map(
    [...counts].map(([key, spellings]) => {
      const [best = ''] = [...spellings]
        .sort(
          ([left, leftCount], [right, rightCount]) =>
            rightCount - leftCount ||
            uppercaseCount(left) - uppercaseCount(right) ||
            left.localeCompare(right),
        )
        .map(([spelling]) => spelling);
      return [key, best];
    }),
  );
}

export function mergeBrands(models: readonly PackedModel[]): PackedModel[] {
  const preferred = preferredSpellings(models);
  return models.map(({ entry, model }) => ({
    entry: { ...entry, brand: preferred.get(entry.brand.toLowerCase()) ?? entry.brand },
    model,
  }));
}

export function libraryOrder(left: PackedModel, right: PackedModel): number {
  const fuller = (one: PackedModel): number => (one.entry.kind === 'climate' ? 0 : 1);
  return (
    left.entry.category.localeCompare(right.entry.category) ||
    left.entry.brand.localeCompare(right.entry.brand) ||
    fuller(left) - fuller(right) ||
    (left.entry.models[0] ?? '').localeCompare(right.entry.models[0] ?? '', undefined, {
      numeric: true,
    }) ||
    left.entry.id.localeCompare(right.entry.id)
  );
}
