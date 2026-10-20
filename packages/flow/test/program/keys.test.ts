import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { automationV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import {
  generateKey,
  isValidKey,
  keyAvailable,
  keyBase,
  reservedKeyProblem,
  uniqueKey,
  usedKeys,
} from '../../src/program/keys';

describe('keyBase', () => {
  it('turns a kind or a name into a camel case identifier', () => {
    expect(keyBase('device.set')).toBe('deviceSet');
    expect(keyBase('Set light')).toBe('setLight');
    expect(keyBase('math.round_half')).toBe('mathRoundHalf');
    expect(keyBase('fn:abc-12')).toBe('fnAbc12');
  });

  it('falls back when nothing usable is left or the word is reserved', () => {
    for (const text of ['', '...', '123', 'run', 'trigger', 'Vars']) {
      expect(isValidKey(keyBase(text))).toBe(true);
    }
    expect(keyBase('')).toBe('node');
    expect(keyBase('123')).toBe('node');
    expect(keyBase('run')).toBe('node');
    expect(keyBase('trigger')).toBe('node');
  });

  it('leaves room for a numeric suffix', () => {
    expect(keyBase('a'.repeat(100)).length).toBe(36);
  });

  it('always gives a valid key', () => {
    fc.assert(fc.property(fc.string(), (text) => isValidKey(keyBase(text))));
  });
});

describe('uniqueKey and generateKey', () => {
  it('counts up from 2 over taken keys', () => {
    expect(uniqueKey('set light', new Set())).toBe('setLight');
    expect(uniqueKey('set light', new Set(['setLight']))).toBe('setLight2');
    expect(uniqueKey('set light', new Set(['setLight', 'setLight2']))).toBe('setLight3');
    expect(generateKey('flow.if', new Set(['flowIf']))).toBe('flowIf2');
  });

  it('never returns a taken key and always a valid one', () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string()), (kind, taken) => {
        const set = new Set(taken);
        const key = generateKey(kind, set);
        expect(set.has(key)).toBe(false);
        expect(isValidKey(key)).toBe(true);
      }),
    );
  });
});

describe('key checks', () => {
  it('explains why a key is refused', () => {
    expect(reservedKeyProblem('setLight')).toBeUndefined();
    expect(reservedKeyProblem('Set')).toContain('lowercase');
    expect(reservedKeyProblem('x'.repeat(41))).toContain('40');
    expect(reservedKeyProblem('trigger')).toContain('reserved');
    expect(reservedKeyProblem('vars')).toContain('reserved');
    expect(isValidKey('vars')).toBe(false);
    expect(isValidKey('else')).toBe(true);
    expect(isValidKey('a1_b')).toBe(true);
  });

  it('refuses a taken key', () => {
    expect(keyAvailable('a', new Set(['a']))).toContain('already used');
    expect(keyAvailable('b', new Set(['a']))).toBeUndefined();
    expect(keyAvailable('vars', new Set())).toContain('reserved');
  });
});

describe('usedKeys', () => {
  it('collects trigger keys and node keys of every scope', () => {
    fc.assert(
      fc.property(automationV3, (program) => {
        const used = usedKeys(program);
        for (const trigger of program.triggers) expect(used.has(trigger.key)).toBe(true);
        for (const node of program.body.nodes) expect(used.has(node.key)).toBe(true);
        for (const node of program.onFailure?.nodes ?? []) expect(used.has(node.key)).toBe(true);
      }),
    );
  });

  it('has no trigger keys for a function', () => {
    const used = usedKeys({
      version: 3,
      kind: 'function',
      flavour: 'pure',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: {
        nodes: [{ id: '00000000-0000-4000-8000-00000000000a', key: 'only', kind: 'math.add' }],
      },
    });
    expect([...used]).toEqual(['only']);
  });
});
