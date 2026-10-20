import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isValidKey } from '../../src/program/keys';
import {
  BODY_PATH,
  ON_FAILURE_PATH,
  childPath,
  formatChildPart,
  formatScopePath,
  parseScopePath,
  sameScopePath,
  type ChildPart,
  type ScopePath,
} from '../../src/program/paths';

const ID = '00000000-0000-4000-8000-00000000000a';

const partArb: fc.Arbitrary<ChildPart> = fc.oneof(
  fc
    .stringMatching(/^[a-z][A-Za-z0-9_]{0,10}$/)
    .map((name): ChildPart => ({ kind: 'scope', name })),
  fc.uuid().map((id): ChildPart => ({ kind: 'branch', id })),
  fc.uuid().map((id): ChildPart => ({ kind: 'case', id })),
  fc.uuid().map((id): ChildPart => ({ kind: 'catch', id })),
);

const pathArb: fc.Arbitrary<ScopePath> = fc.oneof(
  fc.constant(BODY_PATH),
  fc.constant(ON_FAILURE_PATH),
  fc
    .tuple(fc.stringMatching(/^[a-z][A-Za-z0-9_]{0,10}$/).filter(isValidKey), partArb)
    .map(([key, part]) => childPath(key, part)),
);

describe('scope path text', () => {
  it('prints the documented forms', () => {
    expect(formatScopePath(BODY_PATH)).toBe('body');
    expect(formatScopePath(ON_FAILURE_PATH)).toBe('onFailure');
    expect(formatScopePath(childPath('gate', { kind: 'scope', name: 'body' }))).toBe('gate.body');
    expect(formatScopePath(childPath('gate', { kind: 'branch', id: ID }))).toBe(
      `gate.branch:${ID}`,
    );
    expect(formatScopePath(childPath('pick', { kind: 'case', id: ID }))).toBe(`pick.case:${ID}`);
    expect(formatScopePath(childPath('guard', { kind: 'catch', id: ID }))).toBe(
      `guard.catch:${ID}`,
    );
    expect(formatChildPart({ kind: 'scope', name: 'else' })).toBe('else');
  });

  it('parses the documented forms', () => {
    expect(parseScopePath('body')).toBe(BODY_PATH);
    expect(parseScopePath('onFailure')).toBe(ON_FAILURE_PATH);
    expect(parseScopePath('gate.else')).toEqual(childPath('gate', { kind: 'scope', name: 'else' }));
    expect(parseScopePath(`gate.branch:${ID}`)).toEqual(
      childPath('gate', { kind: 'branch', id: ID }),
    );
  });

  it('parses what it prints', () => {
    fc.assert(
      fc.property(pathArb, (path) => {
        expect(parseScopePath(formatScopePath(path))).toEqual(path);
      }),
    );
  });

  it('refuses text that is not a path', () => {
    for (const text of [
      '',
      'bodyx',
      'Body',
      'gate',
      '.body',
      'Gate.body',
      'vars.body',
      'gate.',
      'gate.Body',
      'gate.branch:',
      'gate.branch:nope',
      `gate.leaf:${ID}`,
      `gate.case:${ID.toUpperCase().slice(0, 35)}`,
      'gate.body.extra',
    ]) {
      expect(parseScopePath(text)).toBeUndefined();
    }
  });

  it('compares paths by their text', () => {
    fc.assert(
      fc.property(pathArb, pathArb, (left, right) => {
        expect(sameScopePath(left, right)).toBe(formatScopePath(left) === formatScopePath(right));
        expect(sameScopePath(left, left)).toBe(true);
      }),
    );
  });
});
