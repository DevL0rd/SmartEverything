import { describe, expect, it } from 'vitest';
import { bad, good } from './support';

describe('text.format', () => {
  it('fills the slots of the template from the wired values', () => {
    expect(good('text.format', { template: '3 windows open' })).toEqual({ text: '3 windows open' });
    expect(good('text.format', { template: '{a} windows in {b}', a: 3, b: 'Hall' })).toEqual({
      text: '3 windows in Hall',
    });
    expect(good('text.format', { template: '{a}{b}{c}{d}', a: true, c: ['x', 'y'] })).toEqual({
      text: 'truex, y',
    });
    expect(good('text.format', { template: '{a} at {b}', a: { device: 'washer' } })).toEqual({
      text: 'washer at ',
    });
    expect(good('text.format', { template: '{a}', a: { x: 1 } })).toEqual({ text: '{"x":1}' });
    expect(good('text.format', { template: '{e} {a}', a: 1 })).toEqual({ text: '{e} 1' });
    bad('text.format', { template: 3 }, 'TypeError');
    bad('text.format', {}, 'Invalid');
  });

  it('writes numbers with the places and grouping asked for', () => {
    expect(good('text.format', { template: '{a}', a: 1234.5, places: 2, grouping: true })).toEqual({
      text: '1,234.50',
    });
    expect(good('text.format', { template: '{a}', a: 0.25 })).toEqual({ text: '0.25' });
  });
});

describe('text.join', () => {
  it('joins with a natural last separator', () => {
    expect(
      good('text.join', { items: ['kitchen', 'hall', 'bedroom'], lastSeparator: ' and ' }),
    ).toEqual({ text: 'kitchen, hall and bedroom' });
    expect(good('text.join', { items: ['kitchen', 'hall'], lastSeparator: ' and ' })).toEqual({
      text: 'kitchen and hall',
    });
    expect(good('text.join', { items: ['kitchen'], lastSeparator: ' and ' })).toEqual({
      text: 'kitchen',
    });
    expect(good('text.join', { items: ['a', 'b', 'c'], separator: '-' })).toEqual({
      text: 'a-b-c',
    });
    expect(good('text.join', { items: [] })).toEqual({ text: '' });
    bad('text.join', { items: ['a', 2] }, 'TypeError');
  });
});

describe('text.split', () => {
  it('splits on a plain separator', () => {
    expect(good('text.split', { text: 'a,b,c', separator: ',' })).toEqual({
      parts: ['a', 'b', 'c'],
    });
    expect(good('text.split', { text: 'a,b,c', separator: ',', limit: 2 })).toEqual({
      parts: ['a', 'b,c'],
    });
    expect(
      good('text.split', { text: ' a , ,b ', separator: ',', trim: true, dropEmpty: true }),
    ).toEqual({
      parts: ['a', 'b'],
    });
    expect(good('text.split', { text: 'abc', separator: ',' })).toEqual({ parts: ['abc'] });
    bad('text.split', { text: 'abc', separator: '' }, 'Invalid');
    bad('text.split', { text: 'abc', separator: ',', limit: 0 }, 'Invalid');
  });

  it('splits on a pattern', () => {
    expect(good('text.split', { text: 'a, b;c', separator: '[,;] *', isPattern: true })).toEqual({
      parts: ['a', 'b', 'c'],
    });
    bad('text.split', { text: 'a', separator: ',', isPattern: true, limit: 2 }, 'Invalid');
    bad('text.split', { text: 'a', separator: '(', isPattern: true }, 'Invalid');
  });
});

describe('text.replace', () => {
  it('replaces plain text', () => {
    expect(good('text.replace', { text: 'a-b-c', find: '-', replacement: '+' })).toEqual({
      text: 'a+b+c',
    });
    expect(
      good('text.replace', { text: 'a-b-c', find: '-', replacement: '+', all: false }),
    ).toEqual({
      text: 'a+b-c',
    });
    expect(good('text.replace', { text: 'abc', find: 'x', replacement: '+', all: false })).toEqual({
      text: 'abc',
    });
    expect(good('text.replace', { text: 'a-b', find: '-' })).toEqual({ text: 'ab' });
    bad('text.replace', { text: 'a', find: '' }, 'Invalid');
  });

  it('replaces patterns', () => {
    expect(
      good('text.replace', { text: 'a1b22', find: '\\d+', replacement: '#', isPattern: true }),
    ).toEqual({
      text: 'a#b#',
    });
    expect(
      good('text.replace', {
        text: 'a1b22',
        find: '\\d+',
        replacement: '#',
        isPattern: true,
        all: false,
      }),
    ).toEqual({
      text: 'a#b22',
    });
    expect(
      good('text.replace', {
        text: '12-34 56-78',
        find: '(\\d+)-(\\d+)',
        replacement: '$2/$1',
        isPattern: true,
        all: false,
      }),
    ).toEqual({
      text: '34/12 56-78',
    });
    expect(
      good('text.replace', {
        text: 'x\ny',
        find: 'x',
        replacement: '[$&]$$',
        isPattern: true,
        all: false,
      }),
    ).toEqual({
      text: '[x]$\ny',
    });
    expect(
      good('text.replace', {
        text: 'abc',
        find: 'z',
        replacement: '#',
        isPattern: true,
        all: false,
      }),
    ).toEqual({
      text: 'abc',
    });
    bad('text.replace', { text: 'a', find: '(', replacement: '', isPattern: true }, 'Invalid');
  });
});

describe('text.regex', () => {
  it('extracts the code from an error text', () => {
    expect(good('text.regex', { text: 'Error E07 near E09', pattern: 'E(\\d+)' })).toEqual({
      matched: true,
      match: 'E07',
      groups: { '1': '07' },
      all: ['E07', 'E09'],
    });
  });

  it('reports no match and honours flags', () => {
    expect(good('text.regex', { text: 'nothing', pattern: '\\d' })).toEqual({
      matched: false,
      groups: {},
      all: [],
    });
    expect(good('text.regex', { text: 'ABC', pattern: 'b', ignoreCase: true })).toMatchObject({
      matched: true,
      match: 'B',
      groups: {},
    });
    expect(good('text.regex', { text: 'a\nb', pattern: '^b$', multiline: true })).toMatchObject({
      matched: true,
    });
    expect(good('text.regex', { text: 'ab', pattern: '(a)(b)' })).toMatchObject({
      groups: { '1': 'a', '2': 'b' },
    });
    bad('text.regex', { text: 'a', pattern: '(' }, 'Invalid');
  });
});

describe('text.test', () => {
  it('runs each test', () => {
    expect(good('text.test', { text: 'Netflix - Chrome', other: 'Netflix' })).toEqual({
      result: true,
    });
    expect(
      good('text.test', { text: 'Netflix - Chrome', other: 'Chrome', test: 'ends_with' }),
    ).toEqual({ result: true });
    expect(good('text.test', { text: 'Netflix', other: 'Net', test: 'starts_with' })).toEqual({
      result: true,
    });
    expect(good('text.test', { text: 'Netflix', other: 'netflix', test: 'equals' })).toEqual({
      result: false,
    });
    expect(
      good('text.test', { text: 'Netflix', other: 'netflix', test: 'equals', ignoreCase: true }),
    ).toEqual({ result: true });
    expect(good('text.test', { text: '', test: 'is_empty' })).toEqual({ result: true });
    expect(good('text.test', { text: 'x', test: 'is_empty' })).toEqual({ result: false });
    bad('text.test', { text: 'x', test: 'sounds_like', other: 'x' }, 'Invalid');
    bad('text.test', { text: 'x' }, 'Invalid');
  });
});
