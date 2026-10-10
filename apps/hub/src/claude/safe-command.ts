import { GIT } from './safe-git';
import { PROGRAMS, type ProgramSpec } from './safe-programs';
import { hasParentSegment, realTarget, type Folder } from './safe-path';

export const SECRET_PATH =
  /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|\.docker|\.netrc|\.npmrc|\.pypirc|\.env(\.[^/]*)?|\.credentials\.json|id_(rsa|ed25519|ecdsa)|[^/]*\.pem|[^/]*\.key|[^/]*\.token|shadow|secrets?)(\/|$)|\/\.config\/Claude\/config\.json|\/\.claude\/sessions\//;

const PARENT_GLOB = /(^|\/)\.[*?[]/;

const GIT_RANGE = /^[\w^~@-]([\w/^~@-]*[\w^~@-])?\.{2,3}([\w^~@-]([\w/^~@-]*[\w^~@-])?)?$/;

const NUMBER = /^\d+$/;

function wordReason(word: string, folder: Folder | null, refs: boolean): string | null {
  if (refs && GIT_RANGE.test(word)) {
    return null;
  }
  if (SECRET_PATH.test(word)) {
    return `touches a secrets path (${word})`;
  }
  if (word.startsWith('~') || hasParentSegment(word) || PARENT_GLOB.test(word)) {
    return `leaves the session folder (${word})`;
  }
  if (folder === null) {
    return NUMBER.test(word) ? null : `the session folder is unknown for ${word}`;
  }
  return realTarget(word, folder) === null
    ? `names a path outside the session folder or one that cannot be resolved (${word})`
    : null;
}

function refusal(name: string, word: string): string {
  return `${name} ${word} is not a known read-only option`;
}

function longReason(word: string, spec: ProgramSpec, name: string): string | null {
  const [flag = '', value] = word.slice(2).split(/=(.*)/s);
  const known = value === undefined ? [...(spec.long ?? []), ...(spec.valued ?? [])] : spec.valued;
  return known?.includes(flag) === true ? null : refusal(name, word);
}

function shortReason(word: string, spec: ProgramSpec, name: string): string | null {
  const allowed = (spec.short ?? '') + (spec.digits === true ? '0123456789' : '');
  for (const letter of word.slice(1)) {
    if (!allowed.includes(letter)) {
      return refusal(name, word);
    }
  }
  return null;
}

function flagReason(word: string, spec: ProgramSpec, name: string): string | null {
  if (spec.exact?.includes(word) === true) {
    return null;
  }
  return word.startsWith('--') ? longReason(word, spec, name) : shortReason(word, spec, name);
}

function valueOf(word: string): string | null {
  return word.startsWith('--') && word.includes('=') ? word.slice(word.indexOf('=') + 1) : null;
}

interface Parsed {
  readonly flags: string[];
  readonly operands: string[];
}

function split(words: readonly string[]): Parsed {
  const flags: string[] = [];
  const operands: string[] = [];
  let flagsEnded = false;
  for (const word of words) {
    if (!flagsEnded && word === '--') {
      flagsEnded = true;
    } else if (!flagsEnded && word.length > 1 && word.startsWith('-')) {
      flags.push(word);
    } else {
      operands.push(word);
    }
  }
  return { flags, operands };
}

function operandLimit(spec: ProgramSpec, flags: readonly string[]): number {
  const needed = spec.operandsNeed;
  if (needed !== undefined && !flags.some((flag) => needed.includes(flag.split('=')[0] ?? ''))) {
    return 0;
  }
  return spec.maxOperands ?? Number.POSITIVE_INFINITY;
}

function checkSpec(
  words: readonly string[],
  spec: ProgramSpec,
  folder: Folder | null,
  name: string,
): string[] {
  const { flags, operands } = split(words);
  const reasons = flags.map((flag) => flagReason(flag, spec, name));
  if (operands.length > operandLimit(spec, flags)) {
    reasons.push(`${name} takes arguments here that are not on the read-only list`);
  }
  const refs = spec.refs === true;
  const textual = spec.text === true;
  const pattern = spec.operand;
  for (const operand of operands) {
    if (pattern !== undefined && !pattern.test(operand)) {
      reasons.push(`${name} ${operand} is not a read-only argument`);
    }
    reasons.push(textual ? null : wordReason(operand, folder, refs));
  }
  for (const flag of flags) {
    const value = valueOf(flag);
    reasons.push(value === null ? null : wordReason(value, folder, refs));
  }
  return reasons.filter((reason) => reason !== null);
}

function gitReasons(words: readonly string[], folder: Folder | null): string[] {
  const sub = words[1] ?? '';
  const spec = Object.hasOwn(GIT, sub) ? GIT[sub] : undefined;
  return spec === undefined
    ? [`git ${sub} is not on the read-only list`]
    : checkSpec(words.slice(2), spec, folder, `git ${sub}`);
}

export function commandReasons(words: readonly string[], folder: Folder | null): string[] {
  const program = words[0] ?? '';
  if (program === 'git') {
    return gitReasons(words, folder);
  }
  const spec = Object.hasOwn(PROGRAMS, program) ? PROGRAMS[program] : undefined;
  return spec === undefined
    ? [`${program === '' ? 'an empty command' : program} is not on the read-only list`]
    : checkSpec(words.slice(1), spec, folder, program);
}
