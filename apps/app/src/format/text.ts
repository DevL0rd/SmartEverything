import { collator } from './locale';

const TEXT_ORDER = collator();
const NATURAL_ORDER = collator({ numeric: true, sensitivity: 'base' });

export function titleCase(words: string): string {
  return words
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function compareText(first: string, second: string): number {
  return TEXT_ORDER.compare(first, second);
}

export function naturalCompare(first: string, second: string): number {
  return NATURAL_ORDER.compare(first, second);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

export function joinParts(parts: readonly (string | null | undefined | false)[]): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
}

export function breakableUrl(url: string): string {
  return url.replace(/([./])/g, '$1​');
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
    // eslint-disable-next-line local/no-swallowed-errors -- a URL that does not parse is the typed null result
  } catch {
    return null;
  }
}
