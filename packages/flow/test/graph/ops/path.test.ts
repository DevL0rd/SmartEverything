import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { automation, join, start, step, together } from '../graph-fixtures';
import { expectStructured, expectUndo, nodeAt, ok, refused } from './support';

const forked = automation([
  start('fork'),
  together('fork', [
    { name: 'left', to: 'l1' },
    { name: 'right', to: 'meet' },
  ]),
  step('l1', 'meet'),
  join('meet', 'after'),
  step('after'),
]);

describe('path', () => {
  it('adds a path that goes straight to the Wait for all', () => {
    const done = ok(forked, [{ op: 'path', key: 'fork', edit: { t: 'add', name: 'third' } }]);
    expect(nodeAt(done.program, 'fork').paths?.map((path) => [path.name, path.to])).toEqual([
      ['left', 'l1'],
      ['right', 'meet'],
      ['third', 'meet'],
    ]);
    expectStructured(done.program);
  });

  it('adds a path with an explicit wire and at an index', () => {
    const done = ok(
      forked,
      [{ op: 'path', key: 'fork', edit: { t: 'add', name: 'first', to: 'l1', index: 0 } }],
      { kinds: STATIC_KIND_LOOKUP, allowProblems: true },
    );
    expect(nodeAt(done.program, 'fork').paths?.[0]).toEqual({ name: 'first', to: 'l1' });
  });

  it('renames a path and refuses a taken name and the reserved name', () => {
    const done = ok(forked, [
      { op: 'path', key: 'fork', edit: { t: 'rename', name: 'left', as: 'lights' } },
    ]);
    expect(nodeAt(done.program, 'fork').paths?.[0]?.name).toBe('lights');
    expectStructured(done.program);
    expect(
      refused(forked, [
        { op: 'path', key: 'fork', edit: { t: 'rename', name: 'left', as: 'right' } },
      ]).code,
    ).toBe('key_taken');
    expect(
      refused(forked, [
        { op: 'path', key: 'fork', edit: { t: 'rename', name: 'left', as: 'onError' } },
      ]).problems[0]?.code,
    ).toBe('path_name_reserved');
  });

  it('removes a path but keeps two, and refuses unknown paths and other kinds', () => {
    const three = ok(forked, [
      { op: 'path', key: 'fork', edit: { t: 'add', name: 'third' } },
    ]).program;
    const done = ok(three, [{ op: 'path', key: 'fork', edit: { t: 'remove', name: 'third' } }]);
    expect(nodeAt(done.program, 'fork').paths).toHaveLength(2);
    const result = refused(forked, [
      { op: 'path', key: 'fork', edit: { t: 'remove', name: 'left' } },
    ]);
    expect(result.code).toBe('invalid_result');
    expect(result.problems.map((problem) => problem.code)).toContain('paths_too_few');
    expect(
      refused(forked, [{ op: 'path', key: 'fork', edit: { t: 'remove', name: 'nope' } }]).code,
    ).toBe('unknown_key');
    expect(refused(forked, [{ op: 'path', key: 'l1', edit: { t: 'add', name: 'x' } }]).code).toBe(
      'not_allowed',
    );
  });

  it('undoes add, rename and remove', () => {
    expectUndo(forked, [{ op: 'path', key: 'fork', edit: { t: 'add', name: 'third' } }]);
    expectUndo(forked, [
      { op: 'path', key: 'fork', edit: { t: 'rename', name: 'left', as: 'lights' } },
    ]);
    const three = ok(forked, [
      { op: 'path', key: 'fork', edit: { t: 'add', name: 'third' } },
    ]).program;
    expectUndo(three, [{ op: 'path', key: 'fork', edit: { t: 'remove', name: 'left' } }]);
  });
});
