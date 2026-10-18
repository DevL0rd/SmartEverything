import { createElement, Fragment, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { hasLeading, rowsOf, separatorInset } from './list-rows';

function row(name: string): ReactElement {
  return createElement('row', { key: name, name });
}

function keysOf(rows: readonly ReactElement[]): readonly string[] {
  return rows.map((element) => String(element.key));
}

describe('rowsOf', () => {
  it('keeps one entry per element child and drops nulls, booleans and text', () => {
    const rows = rowsOf([row('a'), null, false, 'text', ' ', row('b')]);
    expect(rows).toHaveLength(2);
  });

  it('turns every row of a fragment into its own entry so each gets a separator', () => {
    const rows = rowsOf([row('a'), createElement(Fragment, { key: 'group' }, row('b'), row('c'))]);
    expect(rows).toHaveLength(3);
  });

  it('flattens nested fragments and arrays', () => {
    const nested = createElement(Fragment, null, createElement(Fragment, null, row('x')), [
      row('y'),
    ]);
    expect(rowsOf(nested)).toHaveLength(2);
  });

  it('gives rows from different fragments distinct keys', () => {
    const rows = rowsOf([
      createElement(Fragment, { key: 'one' }, row('a'), row('b')),
      createElement(Fragment, { key: 'two' }, row('a'), row('b')),
    ]);
    expect(new Set(keysOf(rows)).size).toBe(4);
  });
});

describe('hasLeading', () => {
  it('is true for a row with an icon or a leading node and false without', () => {
    expect(hasLeading(createElement('row', { icon: 'sun' }))).toBe(true);
    expect(hasLeading(createElement('row', { leading: createElement('view') }))).toBe(true);
    expect(hasLeading(createElement('row', { title: 'Plain' }))).toBe(false);
  });

  it('reads the icon of a setting definition given to a wrapper row', () => {
    expect(hasLeading(createElement('row', { setting: { icon: 'sun' } }))).toBe(true);
    expect(hasLeading(createElement('row', { setting: { title: 'Plain' } }))).toBe(false);
  });

  it('looks through a wrapper that has one child', () => {
    const wrapped = createElement('frame', null, createElement('row', { icon: 'sun' }));
    expect(hasLeading(wrapped)).toBe(true);
    expect(hasLeading(createElement('frame', null, createElement('row', {})))).toBe(false);
  });

  it('does not look inside rows with several children', () => {
    const many = createElement('row', null, createElement('a', { icon: 'x' }), createElement('b'));
    expect(hasLeading(many)).toBe(false);
  });
});

describe('separatorInset', () => {
  const iconed = createElement('row', { icon: 'sun' });
  const plain = createElement('row', {});

  it('indents the separator past the leading icon of the row below it', () => {
    expect(separatorInset(iconed, true, false)).toBe('ml-18');
    expect(separatorInset(iconed, true, true)).toBe('ml-16');
  });

  it('keeps the plain indent for a row without a leading icon, whatever the list asks for', () => {
    expect(separatorInset(plain, true, false)).toBe('ml-4');
  });

  it('keeps the plain indent when the list is not inset', () => {
    expect(separatorInset(iconed, false, false)).toBe('ml-4');
  });
});
