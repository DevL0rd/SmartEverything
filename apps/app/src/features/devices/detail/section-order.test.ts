import { describe, expect, it } from 'vitest';
import { arrangeSections, inOrder, showsGenericReadings } from './section-order';

describe('plugin section order', () => {
  it('sorts by order and keeps unordered sections last in their original order', () => {
    const sections = [
      { key: 'later' },
      { key: 'second', order: 20 },
      { key: 'first', order: 10 },
      { key: 'last' },
    ];
    expect(inOrder(sections).map((section) => section.key)).toEqual([
      'first',
      'second',
      'later',
      'last',
    ]);
  });

  it('keeps equal orders in registration order', () => {
    const sections = [
      { key: 'b', order: 1 },
      { key: 'a', order: 1 },
    ];
    expect(inOrder(sections).map((section) => section.key)).toEqual(['b', 'a']);
  });

  it('puts plugin sections after Overview and before History, Activity and All controls', () => {
    const builtin = ['overview', 'controls', 'history', 'activity'].map((key) => ({ key }));
    const plugin = [{ key: 'internet' }, { key: 'clients' }];
    expect(arrangeSections(builtin, plugin).map((section) => section.key)).toEqual([
      'overview',
      'internet',
      'clients',
      'controls',
      'history',
      'activity',
    ]);
  });

  it('leaves the built-in order alone when no plugin adds a section', () => {
    const builtin = ['overview', 'history'].map((key) => ({ key }));
    expect(arrangeSections(builtin, [])).toEqual(builtin);
  });
});

describe('plugin overview readings', () => {
  it('shows the generic readings grid when no overview replaces it', () => {
    expect(showsGenericReadings([])).toBe(true);
    expect(showsGenericReadings([{}, { replacesReadings: false }])).toBe(true);
  });

  it('hides the generic readings grid when an overview replaces it', () => {
    expect(showsGenericReadings([{}, { replacesReadings: true }])).toBe(false);
  });
});
