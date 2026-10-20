import { describe, expect, it } from 'vitest';
import { describeReader } from '../../src/ops/guard';
import {
  countRoot,
  describeSlot,
  readersOf,
  referencesIn,
  renameRoot,
  sitesOf,
} from '../../src/ops/refs';
import { automation, node, trigger, withTriggers } from './support';

describe('referencesIn', () => {
  it('reads a wire and ignores constants', () => {
    expect(referencesIn({ lit: 'a.b' })).toEqual([]);
    expect(referencesIn({ wire: { from: 'a', port: 'b' } })).toEqual([{ from: 'a', port: 'b' }]);
  });
});

describe('renameRoot and countRoot', () => {
  it('rewrites only the source of a wire', () => {
    expect(renameRoot({ wire: { from: 'a', port: 'b' } }, 'a', 'zed')).toEqual({
      value: { wire: { from: 'zed', port: 'b' } },
      count: 1,
    });
    expect(renameRoot({ wire: { from: 'b', port: 'a' } }, 'a', 'zed')).toEqual({
      value: { wire: { from: 'b', port: 'a' } },
      count: 0,
    });
    expect(renameRoot({ lit: 1 }, 'a', 'zed')).toEqual({ value: { lit: 1 }, count: 0 });
    expect(countRoot({ wire: { from: 'a', port: 'b' } }, 'a')).toBe(1);
    expect(countRoot({ lit: 'a' }, 'a')).toBe(0);
  });
});

describe('sites', () => {
  it('lists every place a value can sit, with its owner', () => {
    const program = withTriggers(
      automation([node('a', 'notify.feed', { x: { wire: { from: 'p', port: 'q' } } })]),
      { ...trigger('press'), ports: { at: { wire: { from: 'a', port: 'ok' } } } },
    );
    const sites = sitesOf(program);
    expect(sites.map((site) => site.owner)).toEqual(['press', 'a']);
    const readers = readersOf(program, new Set(['a']));
    expect(readers).toHaveLength(1);
    const [reader] = readers;
    if (reader === undefined) throw new Error('no reader');
    expect(describeReader(reader.site, 'a')).toBe('"a" is read by port "at" of "press"');
  });

  it('assigns and detaches through the site', () => {
    const program = automation([
      node('a', 'notify.feed', { x: { wire: { from: 'p', port: 'q' } }, y: { lit: 1 } }),
    ]);
    const sites = sitesOf(program);
    sites[0]?.assign({ lit: 2 });
    expect(program.body.nodes[0]?.ports).toEqual({ x: { lit: 2 }, y: { lit: 1 } });
    sites[1]?.detach?.();
    expect(program.body.nodes[0]?.ports).toEqual({ x: { lit: 2 } });
  });

  it('describes slots', () => {
    expect(describeSlot({ kind: 'port', name: 'x' })).toBe('port "x"');
    expect(describeSlot({ kind: 'other', label: 'the admit rule' })).toBe('the admit rule');
    const holder = {
      ...automation([]),
      variables: [
        { name: 'v', type: { t: 'number' as const }, initial: { wire: { from: 'a', port: 'b' } } },
      ],
    };
    const [site] = sitesOf(holder);
    if (site === undefined) throw new Error('no site');
    expect(describeReader(site, 'a')).toContain('the program');
  });
});
