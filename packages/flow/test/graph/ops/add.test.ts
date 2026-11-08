import { describe, expect, it } from 'vitest';
import { automation, idOf, ifNode, start, step } from '../graph-fixtures';
import { chain, expectStructured, expectUndo, nodeAt, ok, refused, toOf } from './support';

describe('add', () => {
  it('adds an unconnected node that connect then wires in', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'extra' } },
      { op: 'connect', from: 'c', port: 'next', to: 'extra' },
    ]);
    expect(toOf(done.program, 'c', 'next')).toBe('extra');
    expect(done.created.map((made) => made.key)).toEqual(['extra']);
    expectStructured(done.program);
  });

  it('gives a generated readable key and an id when none is named', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'device.set' }, after: { key: 'c', port: 'next' } },
    ]);
    expect(done.created[0]?.key).toBe('deviceSet');
    expect(done.created[0]?.id).toMatch(/^22222222-/);
  });

  it('splices into a wire: the port goes to the new node and its Then to the old target', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'mid' }, after: { key: 'a', port: 'next' } },
    ]);
    expect(toOf(done.program, 'a', 'next')).toBe('mid');
    expect(toOf(done.program, 'mid', 'next')).toBe('b');
    expectStructured(done.program);
  });

  it('splices after Start and onto an unwired end', () => {
    const first = ok(chain(), [
      {
        op: 'add',
        node: { kind: 'device.set', key: 'head' },
        after: { key: 'start', port: 'next' },
      },
    ]);
    expect(toOf(first.program, 'start', 'next')).toBe('head');
    expect(toOf(first.program, 'head', 'next')).toBe('a');
    const tail = ok(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'tail' }, after: { key: 'c', port: 'next' } },
    ]);
    expect(toOf(tail.program, 'c', 'next')).toBe('tail');
    expect(nodeAt(tail.program, 'tail').to).toBeUndefined();
  });

  it('gives a decision the old target on its first branch', () => {
    const done = ok(chain(), [
      {
        op: 'add',
        node: { kind: 'flow.if', key: 'check', branches: [{ when: { lit: true } }] },
        after: { key: 'a', port: 'next' },
      },
    ]);
    const row = nodeAt(done.program, 'check').branches?.[0];
    expect(row?.to).toBe('b');
    expectStructured(done.program);
  });

  it('refuses a splice that has nowhere to carry on to, and a clash with an explicit wire', () => {
    expect(
      refused(chain(), [
        { op: 'add', node: { kind: 'flow.stop', key: 'halt' }, after: { key: 'a', port: 'next' } },
      ]).code,
    ).toBe('not_allowed');
    expect(
      refused(chain(), [
        {
          op: 'add',
          node: { kind: 'device.set', key: 'mid', to: { next: 'c' } },
          after: { key: 'a', port: 'next' },
        },
      ]).code,
    ).toBe('not_allowed');
    const ended = ok(automation([start('a'), step('a')]), [
      { op: 'add', node: { kind: 'flow.stop', key: 'halt' }, after: { key: 'a', port: 'next' } },
    ]);
    expect(toOf(ended.program, 'a', 'next')).toBe('halt');
  });

  it('adds Do together with its Wait for all and wires empty paths into it', () => {
    const done = ok(chain(), [
      {
        op: 'add',
        node: { kind: 'flow.parallel', key: 'fork' },
        after: { key: 'a', port: 'next' },
      },
    ]);
    const fork = nodeAt(done.program, 'fork');
    const joinKey = done.created[1]?.key ?? '';
    expect(nodeAt(done.program, joinKey).kind).toBe('flow.join');
    expect(fork.paths?.map((path) => path.to)).toEqual([joinKey, joinKey]);
    expect(toOf(done.program, 'a', 'next')).toBe('fork');
    expect(toOf(done.program, joinKey, 'next')).toBe('b');
    expectStructured(done.program);
  });

  it('keeps wired paths of a new Do together as given and honours a named join', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'left' } },
      {
        op: 'add',
        node: {
          kind: 'flow.parallel',
          key: 'fork',
          paths: [{ name: 'one', to: 'left' }, { name: 'two' }],
        },
        join: { key: 'meet' },
        after: { key: 'a', port: 'next' },
      },
      { op: 'connect', from: 'left', port: 'next', to: 'meet' },
    ]);
    expect(nodeAt(done.program, 'fork').paths?.map((path) => path.to)).toEqual(['left', 'meet']);
    expectStructured(done.program);
  });

  it('refuses join on any other kind and key reuse', () => {
    expect(
      refused(chain(), [{ op: 'add', node: { kind: 'device.set' }, join: { key: 'meet' } }]).code,
    ).toBe('not_allowed');
    expect(refused(chain(), [{ op: 'add', node: { kind: 'device.set', key: 'a' } }]).code).toBe(
      'key_taken',
    );
    expect(
      refused(chain(), [{ op: 'add', node: { kind: 'device.set', id: idOf('a') } }]).code,
    ).toBe('id_taken');
  });

  it('adds a trigger to an automation only and refuses to wire it', () => {
    const done = ok(chain(), [
      { op: 'add', node: { kind: 'trigger.signal', key: 'sig', ports: {} } },
    ]);
    expect(
      done.program.kind === 'automation' ? done.program.triggers.map((t) => t.key) : [],
    ).toEqual(['sig']);
    expect(
      refused(chain(), [
        { op: 'add', node: { kind: 'trigger.signal' }, after: { key: 'a', port: 'next' } },
      ]).code,
    ).toBe('not_allowed');
  });

  it('undoes a splice, a plain add and a Do together add exactly', () => {
    expectUndo(chain(), [
      { op: 'add', node: { kind: 'device.set', key: 'mid' }, after: { key: 'a', port: 'next' } },
    ]);
    expectUndo(chain(), [
      {
        op: 'add',
        node: { kind: 'flow.parallel', key: 'fork' },
        after: { key: 'b', port: 'next' },
      },
    ]);
    expectUndo(automation([start('d'), ifNode('d', [{ name: 'x', to: 'y' }]), step('y')]), [
      { op: 'add', node: { kind: 'device.set', key: 'extra' } },
    ]);
  });
});
