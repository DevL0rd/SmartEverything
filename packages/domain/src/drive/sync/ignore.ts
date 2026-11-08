export interface IgnoreRule {
  readonly negated: boolean;
  readonly expression: RegExp;
}

export interface IgnoreError {
  readonly line: number;
  readonly message: string;
}

export type IgnoreParse =
  | { readonly ok: true; readonly matcher: IgnoreMatcher }
  | { readonly ok: false; readonly errors: readonly IgnoreError[] };

export interface IgnoreMatcher {
  readonly rules: readonly IgnoreRule[];
  readonly isIgnored: (path: string) => boolean;
}

const SPECIAL = /[.+^${}()|\]\\/]/u;

function translateClass(pattern: string, from: number): readonly [string, number] | null {
  const close = pattern.indexOf(']', from + 2);
  if (close === -1) return null;
  const body = pattern.slice(from + 1, close);
  const negated = body.startsWith('!') || body.startsWith('^');
  const inner = (negated ? body.slice(1) : body).replaceAll('\\', '\\\\');
  return [`[${negated ? '^' : ''}${inner}]`, close];
}

function translateStars(pattern: string, from: number): readonly [string, number] {
  if (pattern[from + 1] !== '*') return ['[^/]*', from];
  if (pattern[from + 2] === '/') return ['(?:.*/)?', from + 2];
  return ['.*', from + 1];
}

function translateGlob(pattern: string): string | null {
  let out = '';
  for (let at = 0; at < pattern.length; at += 1) {
    const char = pattern.charAt(at);
    if (char === '*') {
      const [text, last] = translateStars(pattern, at);
      out += text;
      at = last;
    } else if (char === '?') {
      out += '[^/]';
    } else if (char === '[') {
      const cls = translateClass(pattern, at);
      if (cls === null) return null;
      out += cls[0];
      at = cls[1];
    } else {
      out += SPECIAL.test(char) ? `\\${char}` : char;
    }
  }
  return out;
}

interface Prefix {
  readonly insensitive: boolean;
  readonly negated: boolean;
  readonly body: string;
}

function splitPrefix(line: string, defaultInsensitive: boolean): Prefix {
  let body = line;
  let insensitive = defaultInsensitive;
  let negated = false;
  for (let again = true; again;) {
    again = false;
    if (body.startsWith('(?i)')) {
      insensitive = true;
      body = body.slice(4);
      again = true;
    } else if (body.startsWith('!')) {
      negated = !negated;
      body = body.slice(1);
      again = true;
    }
  }
  return { insensitive, negated, body };
}

function compileRule(line: string, defaultInsensitive: boolean): IgnoreRule | string {
  const { insensitive, negated, body } = splitPrefix(line, defaultInsensitive);
  if (body.startsWith('(?')) return 'unknown pattern flag';
  const anchored = body.startsWith('/');
  const glob = translateGlob(anchored ? body.slice(1) : body);
  if (glob === null) return 'unterminated character class';
  if (glob === '') return 'empty pattern';
  const source = `^${anchored ? '' : '(?:.*/)?'}${glob}$`;
  return { negated, expression: new RegExp(source, insensitive ? 'iu' : 'u') };
}

function significant(raw: string): string | null {
  const line = raw.replace(/\r$/u, '').trim();
  return line === '' || line.startsWith('//') ? null : line;
}

function decide(rules: readonly IgnoreRule[], prefix: string): boolean | null {
  const hit = rules.find((rule) => rule.expression.test(prefix));
  return hit === undefined ? null : !hit.negated;
}

function ignoredPath(rules: readonly IgnoreRule[], path: string): boolean {
  const segments = path.split('/');
  for (let end = 1; end <= segments.length; end += 1) {
    if (decide(rules, segments.slice(0, end).join('/')) === true) return true;
  }
  return false;
}

export function createIgnoreMatcher(rules: readonly IgnoreRule[]): IgnoreMatcher {
  return { rules, isIgnored: (path) => ignoredPath(rules, path) };
}

export function parseIgnore(text: string, defaultInsensitive: boolean): IgnoreParse {
  const rules: IgnoreRule[] = [];
  const errors: IgnoreError[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = significant(raw);
    if (line === null) return;
    const rule = compileRule(line, defaultInsensitive);
    if (typeof rule === 'string') errors.push({ line: index + 1, message: rule });
    else rules.push(rule);
  });
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, matcher: createIgnoreMatcher(rules) };
}
