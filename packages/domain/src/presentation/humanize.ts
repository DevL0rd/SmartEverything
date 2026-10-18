const UNIT_WORDS: ReadonlyMap<string, string> = new Map([
  ['arcdegrees', '°'],
  ['percentage', '%'],
  ['celsius', '°C'],
  ['fahrenheit', '°F'],
  ['seconds', 's'],
  ['minutes', 'min'],
  ['hours', 'h'],
  ['days', 'd'],
  ['kelvin', 'K'],
  ['watt', 'W'],
  ['lux', 'lx'],
  ['μg/m3', 'µg/m³'],
  ['mg/m3', 'mg/m³'],
]);

const WORD_START = /([a-z0-9])([A-Z])(?=[a-z0-9])/g;

const ACRONYM_START = /([a-z0-9])([A-Z])/g;

const KEY_SEPARATORS = /[\s._-]+/g;

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-z]{2,})(\d)/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter((word) => word !== '');
}

function isAcronym(word: string): boolean {
  return word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
}

function sentenceCase(words: readonly string[], shouting: boolean): string {
  const cased = words.map((word) => (!shouting && isAcronym(word) ? word : word.toLowerCase()));
  return capitalised(cased.join(' '));
}

export function humanizeKey(key: string): string {
  const words = key
    .replace(
      WORD_START,
      (_, before: string, capital: string) => `${before} ${capital.toLowerCase()}`,
    )
    .replace(ACRONYM_START, '$1 $2')
    .replace(KEY_SEPARATORS, ' ')
    .trim();
  return words === '' ? key : capitalised(words);
}

export function humanizeEnum(value: string): string {
  const words = wordsOf(value);
  if (words.length === 0) {
    return value;
  }
  const letters = value.replace(/[^A-Za-z]/g, '');
  const shouting = letters.length > 3 && letters === letters.toUpperCase();
  return sentenceCase(words, shouting);
}

export function providerLabelOf(label: string): string {
  const separator = label.lastIndexOf(': ');
  const name = separator < 0 ? label : label.slice(separator + 2);
  return humanizeEnum(name.trim() === '' ? label : name);
}

export function serviceOf(label: string): string | null {
  const separator = label.indexOf(': ');
  return separator > 0 ? humanizeEnum(label.slice(0, separator)) : null;
}

export function friendlyUnit(unit: string | undefined): string | null {
  if (unit === undefined || unit === '') {
    return null;
  }
  return UNIT_WORDS.get(unit.toLowerCase()) ?? unit;
}
