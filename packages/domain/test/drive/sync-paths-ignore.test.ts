import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  caseCollisions,
  checkSyncPath,
  collidesWith,
  normalizeSyncPath,
  parseIgnore,
  type IgnoreMatcher,
  type SyncPathPolicy,
} from '../../src/drive/sync';

const PORTABLE = { portable: true } as const;
const NATIVE = { portable: false } as const;

function refusal(path: string, policy: SyncPathPolicy = PORTABLE): string | null {
  const result = checkSyncPath(path, policy);
  return result.ok ? null : result.refusal;
}

function matcher(text: string, insensitive = false): IgnoreMatcher {
  const parsed = parseIgnore(text, insensitive);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.matcher;
}

describe('sync paths', () => {
  it('accepts ordinary relative paths', () => {
    expect(checkSyncPath('docs/a b/c.txt', PORTABLE)).toEqual({ ok: true, path: 'docs/a b/c.txt' });
    expect(refusal('docs/..hidden/.git')).toBeNull();
  });

  it('refuses structural problems on every policy', () => {
    expect(refusal('', NATIVE)).toBe('empty');
    expect(refusal('/etc/passwd', NATIVE)).toBe('absolute');
    expect(refusal('a/../b', NATIVE)).toBe('dot_segment');
    expect(refusal('./a', NATIVE)).toBe('dot_segment');
    expect(refusal('a//b', NATIVE)).toBe('empty_segment');
    expect(refusal('a/', NATIVE)).toBe('empty_segment');
    expect(refusal('a\u0000b', NATIVE)).toBe('nul');
    expect(refusal('é', NATIVE)).toBe('not_nfc');
    expect(refusal('é', NATIVE)).toBeNull();
  });

  it('applies Windows rules only for portable folders', () => {
    expect(refusal('a/CON', NATIVE)).toBeNull();
    expect(refusal('a/CON')).toBe('reserved_name');
    expect(refusal('a/con.txt')).toBe('reserved_name');
    expect(refusal('com1')).toBe('reserved_name');
    expect(refusal('LPT9.log')).toBe('reserved_name');
    expect(refusal('console.txt')).toBeNull();
    expect(refusal('a/name.')).toBe('trailing_dot_or_space');
    expect(refusal('a/name ')).toBe('trailing_dot_or_space');
    expect(refusal('a/na:me')).toBe('illegal_character');
    expect(refusal('a/na?me', NATIVE)).toBeNull();
  });

  it('normalises to NFC idempotently', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const once = normalizeSyncPath(text);
        expect(normalizeSyncPath(once)).toBe(once);
      }),
    );
  });

  it('finds case-only collisions', () => {
    expect(caseCollisions(['a/B.txt', 'a/b.txt', 'c'])).toEqual([['a/B.txt', 'a/b.txt']]);
    expect(caseCollisions(['a', 'b'])).toEqual([]);
    expect(collidesWith('A/x', ['a/x', 'b'])).toBe('a/x');
    expect(collidesWith('a/x', ['a/x'])).toBeNull();
  });
});

describe('ignore matcher', () => {
  it('matches names at any depth unless anchored', () => {
    const m = matcher('node_modules\n/build\n*.tmp');
    expect(m.isIgnored('node_modules')).toBe(true);
    expect(m.isIgnored('a/b/node_modules/x.js')).toBe(true);
    expect(m.isIgnored('build')).toBe(true);
    expect(m.isIgnored('a/build')).toBe(false);
    expect(m.isIgnored('a/b/x.tmp')).toBe(true);
    expect(m.isIgnored('a/b/x.txt')).toBe(false);
  });

  it('first match wins and a bang unignores', () => {
    const m = matcher('!keep.log\n*.log');
    expect(m.isIgnored('keep.log')).toBe(false);
    expect(m.isIgnored('a/keep.log')).toBe(false);
    expect(m.isIgnored('other.log')).toBe(true);
    const reversed = matcher('*.log\n!keep.log');
    expect(reversed.isIgnored('keep.log')).toBe(true);
  });

  it('ignoring a folder ignores its contents', () => {
    const m = matcher('cache');
    expect(m.isIgnored('cache/deep/file')).toBe(true);
    expect(m.isIgnored('cachefile')).toBe(false);
  });

  it('supports star, double star, question mark and classes', () => {
    const m = matcher('a/**/z\nb?\n[xy]1\nc*d');
    expect(m.isIgnored('a/z')).toBe(true);
    expect(m.isIgnored('a/m/n/z')).toBe(true);
    expect(m.isIgnored('b1')).toBe(true);
    expect(m.isIgnored('b12')).toBe(false);
    expect(m.isIgnored('x1')).toBe(true);
    expect(m.isIgnored('z1')).toBe(false);
    expect(m.isIgnored('cxyzd')).toBe(true);
    expect(m.isIgnored('c/d')).toBe(false);
  });

  it('handles case flags', () => {
    expect(matcher('Photo.JPG').isIgnored('photo.jpg')).toBe(false);
    expect(matcher('(?i)Photo.JPG').isIgnored('photo.jpg')).toBe(true);
    expect(matcher('Photo.JPG', true).isIgnored('photo.jpg')).toBe(true);
    expect(matcher('!(?i)keep\n(?i)*').isIgnored('KEEP')).toBe(false);
  });

  it('skips comments and blank lines and reports bad lines', () => {
    expect(matcher('// note\n\n  \nfoo\r\n').isIgnored('foo')).toBe(true);
    const bad = parseIgnore('ok\n[abc\n!\n(?x)foo', false);
    expect(bad).toEqual({
      ok: false,
      errors: [
        { line: 2, message: 'unterminated character class' },
        { line: 3, message: 'empty pattern' },
        { line: 4, message: 'unknown pattern flag' },
      ],
    });
  });

  it('treats regex characters literally', () => {
    const m = matcher('a+b(1).txt');
    expect(m.isIgnored('a+b(1).txt')).toBe(true);
    expect(m.isIgnored('aab(1)Xtxt')).toBe(false);
  });

  const segment = fc.stringMatching(/^[a-z0-9]{1,6}$/);
  const path = fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join('/'));

  it('an empty list ignores nothing and a double star ignores everything', () => {
    fc.assert(
      fc.property(path, (p) => {
        expect(matcher('').isIgnored(p)).toBe(false);
        expect(matcher('**').isIgnored(p)).toBe(true);
      }),
    );
  });

  it('a literal pattern ignores exactly the paths containing that name', () => {
    fc.assert(
      fc.property(segment, path, (name, p) => {
        expect(matcher(name).isIgnored(p)).toBe(p.split('/').includes(name));
      }),
    );
  });

  it('a leading bang rule beats a later catch-all for the same path', () => {
    fc.assert(
      fc.property(segment, (name) => {
        const m = matcher(`!${name}\n**`);
        expect(m.isIgnored(name)).toBe(false);
      }),
    );
  });

  it('is deterministic and case folding is symmetric', () => {
    fc.assert(
      fc.property(segment, path, (name, p) => {
        const m = matcher(`(?i)${name}`);
        expect(m.isIgnored(p.toUpperCase())).toBe(m.isIgnored(p));
      }),
    );
  });
});
