import { REF_KINDS } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import type { Ports, PureBodies, PureBody } from './support';
import {
  fail,
  isFlag,
  isList,
  isNumber,
  isRecord,
  isText,
  mismatch,
  outputs,
  reasonOf,
} from './support';

const SLOT = /\{([abcd])\}/g;

function texts(values: readonly JsonValue[], label: string): readonly string[] {
  return values.map((value, index) =>
    isText(value) ? value : mismatch(`${label} ${String(index + 1)}`, 'text', value),
  );
}

function patternOf(source: string, flags: string): RegExp {
  try {
    return new RegExp(source, flags);
  } catch (error) {
    return fail('Invalid', `the pattern ${source} is not valid: ${reasonOf(error)}`);
  }
}

function numberText(value: number, ports: Ports): string {
  const places = ports.maybeNumber('places');
  const digits =
    places === undefined
      ? { maximumFractionDigits: 20 }
      : { minimumFractionDigits: places, maximumFractionDigits: places };
  return new Intl.NumberFormat('en', { useGrouping: ports.flag('grouping'), ...digits }).format(
    value,
  );
}

const REFERENCE_KINDS: ReadonlySet<string> = new Set(REF_KINDS);

function referenceId(value: JsonValue): string | undefined {
  if (!isRecord(value)) return undefined;
  const [only, ...rest] = Object.entries(value);
  if (only === undefined || rest.length > 0 || !REFERENCE_KINDS.has(only[0])) return undefined;
  return isText(only[1]) ? only[1] : undefined;
}

function slotText(value: JsonValue | undefined, ports: Ports): string {
  if (value === undefined || value === null) return '';
  if (isNumber(value)) return numberText(value, ports);
  if (isText(value)) return value;
  if (isList(value)) return value.map((item) => slotText(item, ports)).join(', ');
  if (isFlag(value)) return String(value);
  return referenceId(value) ?? JSON.stringify(value);
}

const format: PureBody = (ports) => ({
  text: ports
    .text('template')
    .replace(SLOT, (_slot, name: string) => slotText(ports.raw(name), ports)),
});

const join: PureBody = (ports) => {
  const items = texts(ports.list('items'), 'item');
  const separator = ports.text('separator');
  const last = ports.maybeText('lastSeparator');
  if (last === undefined || items.length < 2) return { text: items.join(separator) };
  return { text: `${items.slice(0, -1).join(separator)}${last}${items.at(-1) ?? ''}` };
};

function plainSeparator(separator: string): string {
  return separator === '' ? fail('Invalid', 'the separator cannot be empty') : separator;
}

function cutAt(text: string, separator: string, limit: number | undefined): readonly string[] {
  const parts: string[] = [];
  let rest = text;
  while (limit === undefined || parts.length < limit - 1) {
    const index = rest.indexOf(separator);
    if (index < 0) break;
    parts.push(rest.slice(0, index));
    rest = rest.slice(index + separator.length);
  }
  return [...parts, rest];
}

function validLimit(limit: number | undefined): number | undefined {
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return fail('Invalid', 'the limit must be a whole number from 1');
  }
  return limit;
}

function pieces(
  text: string,
  separator: string,
  isPattern: boolean,
  limit: number | undefined,
): readonly string[] {
  if (!isPattern) return cutAt(text, plainSeparator(separator), limit);
  if (limit !== undefined)
    return fail('Invalid', 'a limit works with a plain separator, not a pattern');
  return text.split(patternOf(separator, ''));
}

const split: PureBody = (ports) => {
  const cut = pieces(
    ports.text('text'),
    ports.text('separator'),
    ports.flag('isPattern'),
    validLimit(ports.maybeNumber('limit')),
  );
  const trimmed = ports.flag('trim') ? cut.map((part) => part.trim()) : cut;
  return { parts: ports.flag('dropEmpty') ? trimmed.filter((part) => part !== '') : trimmed };
};

function replaceLiteral(text: string, find: string, replacement: string, all: boolean): string {
  const plain = plainSeparator(find);
  if (all) return text.split(plain).join(replacement);
  const index = text.indexOf(plain);
  if (index < 0) return text;
  return text.slice(0, index) + replacement + text.slice(index + plain.length);
}

function replacePattern(text: string, find: string, replacement: string, all: boolean): string {
  return text.replace(patternOf(find, all ? 'g' : ''), replacement);
}

const replace: PureBody = (ports) => {
  const apply = ports.flag('isPattern') ? replacePattern : replaceLiteral;
  return {
    text: apply(
      ports.text('text'),
      ports.text('find'),
      ports.text('replacement'),
      ports.flag('all'),
    ),
  };
};

function groupsOf(found: RegExpMatchArray): Record<string, JsonValue> {
  const groups: Record<string, JsonValue> = {};
  found.slice(1).forEach((group, index) => {
    groups[String(index + 1)] = group ?? '';
  });
  return { ...groups, ...found.groups };
}

const regex: PureBody = (ports) => {
  const text = ports.text('text');
  const flags = `${ports.flag('ignoreCase') ? 'i' : ''}${ports.flag('multiline') ? 'm' : ''}`;
  const source = ports.text('pattern');
  const found = text.match(patternOf(source, flags));
  if (found === null) return { matched: false, groups: {}, all: [] };
  return outputs({
    matched: true,
    match: found[0],
    groups: groupsOf(found),
    all: [...text.matchAll(patternOf(source, `${flags}g`))].map((each) => each[0]),
  });
};

const TESTS: Readonly<Record<string, (text: string, other: string) => boolean>> = {
  contains: (text, other) => text.includes(other),
  starts_with: (text, other) => text.startsWith(other),
  ends_with: (text, other) => text.endsWith(other),
  equals: (text, other) => text === other,
};

const testText: PureBody = (ports) => {
  const text = ports.text('text');
  const test = ports.text('test');
  if (test === 'is_empty') return { result: text === '' };
  const check = TESTS[test] ?? fail('Invalid', `${test} is not a text test`);
  const fold = (value: string): string => (ports.flag('ignoreCase') ? value.toLowerCase() : value);
  return { result: check(fold(text), fold(ports.text('other'))) };
};

export const TEXT_BODIES: PureBodies = {
  'text.format': format,
  'text.join': join,
  'text.split': split,
  'text.replace': replace,
  'text.regex': regex,
  'text.test': testText,
};
