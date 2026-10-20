import { IDENT_PATTERN, isReservedWord } from '@smarteverything/domain';
import type { Program } from './walk';
import { walkProgram } from './walk';

const MAX_KEY = 40;
const FALLBACK_BASE = 'node';

export function isValidKey(key: string): boolean {
  return IDENT_PATTERN.test(key) && !isReservedWord(key);
}

function words(text: string): readonly string[] {
  return text.split(/[^A-Za-z0-9]+/).filter((word) => word !== '');
}

function camel(parts: readonly string[]): string {
  return parts
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('');
}

export function keyBase(source: string): string {
  const joined = camel(words(source)).replace(/^[^a-z]+/, '');
  const base = joined.slice(0, MAX_KEY - 4);
  return base === '' || isReservedWord(base) ? FALLBACK_BASE : base;
}

export function usedKeys(program: Program): ReadonlySet<string> {
  const used = new Set<string>(
    program.kind === 'automation' ? program.triggers.map((t) => t.key) : [],
  );
  for (const walked of walkProgram(program)) used.add(walked.node.key);
  return used;
}

export function uniqueKey(base: string, taken: ReadonlySet<string>): string {
  const start = keyBase(base);
  if (!taken.has(start)) return start;
  for (let n = 2; ; n += 1) {
    const candidate = `${start}${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function generateKey(kind: string, taken: ReadonlySet<string>): string {
  return uniqueKey(kind, taken);
}

export function reservedKeyProblem(key: string): string | undefined {
  if (!IDENT_PATTERN.test(key)) {
    return 'a key starts with a lowercase letter and has at most 40 letters, digits or underscores';
  }
  return isReservedWord(key) ? `"${key}" is reserved as a wire source` : undefined;
}

export function keyAvailable(key: string, taken: ReadonlySet<string>): string | undefined {
  return (
    reservedKeyProblem(key) ?? (taken.has(key) ? `the key "${key}" is already used` : undefined)
  );
}
