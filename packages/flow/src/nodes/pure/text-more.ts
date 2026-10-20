import { instantOf } from './moments';
import type { Ports, PureBodies, PureBody, PureEnvironment } from './support';
import { fail, finite, isNumber, mismatch, reasonOf } from './support';

const ELLIPSIS = '…';

function capitalised(text: string): string {
  return text.replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

const CASES: Readonly<Record<string, (text: string) => string>> = {
  trim: (text) => text.trim(),
  lower: (text) => text.toLowerCase(),
  upper: (text) => text.toUpperCase(),
  title: (text) =>
    text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_all, edge: string, letter: string) => {
      return `${edge}${letter.toUpperCase()}`;
    }),
  sentence: (text) =>
    capitalised(text.toLowerCase()).replace(
      /([.!?]\s+)(\p{L})/gu,
      (_all, edge: string, letter: string) => `${edge}${letter.toUpperCase()}`,
    ),
  slug: (text) =>
    text
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, ''),
};

const tidy: PureBody = (ports) => {
  const mode = ports.text('mode');
  const change = CASES[mode] ?? fail('Invalid', `${mode} is not a way to tidy text`);
  return { text: change(ports.text('text')) };
};

function whole(value: number | undefined, label: string, least: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < least) {
    return fail('Invalid', `${label} must be a whole number of at least ${String(least)}`);
  }
  return value;
}

function padded(characters: readonly string[], ports: Ports): readonly string[] {
  const target = whole(ports.maybeNumber('padTo'), 'padTo', 0);
  const filler = Array.from(ports.text('padWith'));
  if (filler.length !== 1) return fail('Invalid', 'padWith must be exactly one character');
  if (target === undefined || characters.length >= target) return characters;
  const padding = Array.from({ length: target - characters.length }, () => filler[0] ?? ' ');
  return ports.text('padAt') === 'start'
    ? [...padding, ...characters]
    : [...characters, ...padding];
}

function shortened(characters: readonly string[], limit: number | undefined): readonly string[] {
  if (limit === undefined || characters.length <= limit) return characters;
  return [...characters.slice(0, limit - 1), ELLIPSIS];
}

const slice: PureBody = (ports) => {
  const characters = Array.from(ports.text('text'));
  const from = whole(ports.number('from'), 'from', Number.NEGATIVE_INFINITY) ?? 0;
  const start = Math.max(0, from < 0 ? characters.length + from : from);
  const count = whole(ports.maybeNumber('count'), 'count', 0);
  const taken = characters.slice(start, count === undefined ? undefined : start + count);
  const limit = whole(ports.maybeNumber('shortenTo'), 'shortenTo', 1);
  const result = padded(shortened(taken, limit), ports);
  return { text: result.join(''), length: result.length };
};

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];
const LARGEST = 1e15;

function underHundred(value: number): string {
  if (value < ONES.length) return ONES[value] ?? '';
  const ones = value % 10;
  return `${TENS[Math.floor(value / 10)] ?? ''}${ones === 0 ? '' : `-${ONES[ones] ?? ''}`}`;
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  if (hundreds === 0) return underHundred(rest);
  const head = `${ONES[hundreds] ?? ''} hundred`;
  return rest === 0 ? head : `${head} and ${underHundred(rest)}`;
}

function groupsOf(value: number): readonly number[] {
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  return groups;
}

function wholeWords(value: number): string {
  if (value === 0) return ONES[0] ?? '';
  return groupsOf(value)
    .map((group, scale) =>
      group === 0 ? '' : `${underThousand(group)}${scale === 0 ? '' : ` ${SCALES[scale] ?? ''}`}`,
    )
    .reverse()
    .filter((part) => part !== '')
    .join(' ');
}

function numberWords(value: number): string {
  const size = Math.abs(value);
  if (size >= LARGEST || /e/i.test(String(size))) {
    return fail('Invalid', `${String(value)} is too large or too small to say`);
  }
  const [integer = '0', decimals] = String(size).split('.');
  const spoken = wholeWords(Number(integer));
  const tail =
    decimals === undefined
      ? ''
      : ` point ${Array.from(decimals, (digit) => ONES[Number(digit)] ?? '').join(' ')}`;
  return `${value < 0 ? 'minus ' : ''}${spoken}${tail}`;
}

function plural(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}

function durationWords(milliseconds: number): string {
  if (milliseconds < 0) return fail('Invalid', 'a negative duration cannot be said');
  const seconds = Math.round(milliseconds / 1000);
  const parts = [
    plural(Math.floor(seconds / 86_400), 'day'),
    plural(Math.floor((seconds % 86_400) / 3600), 'hour'),
    plural(Math.floor((seconds % 3600) / 60), 'minute'),
    plural(seconds % 60, 'second'),
  ].filter((part) => !part.startsWith('0 '));
  if (parts.length === 0) return '0 seconds';
  const last = parts.at(-1) ?? '';
  return parts.length === 1 ? last : `${parts.slice(0, -1).join(', ')} and ${last}`;
}

function momentWords(value: number, ports: Ports, environment: PureEnvironment): string {
  const locale = ports.maybeText('locale') ?? 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: environment.timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(value);
  } catch (error) {
    return fail('Invalid', `${locale} is not a locale (${reasonOf(error)})`);
  }
}

const speakable: PureBody = (ports, environment) => {
  const value = ports.need('value');
  const kind = ports.text('kind');
  if (kind === 'moment') {
    return { text: momentWords(instantOf(value, 'value'), ports, environment) };
  }
  if (!isNumber(value)) return mismatch('value', `a ${kind}`, value);
  const unit = ports.maybeText('unit');
  if (kind === 'duration') return { text: durationWords(finite(value, 'the duration')) };
  if (kind !== 'number') return fail('Invalid', `${kind} is not something to say`);
  return { text: unit === undefined ? numberWords(value) : `${numberWords(value)} ${unit}` };
};

export const TEXT_MORE_BODIES: PureBodies = {
  'text.case': tidy,
  'text.slice': slice,
  'text.speakable': speakable,
};
