import type { FlowNode } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/ops/reducer';
import type { Program } from '@smarteverything/flow/program/walk';
import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_FORMAT,
  copyPayload,
  duplicateOps,
  parseClipboard,
  pasteOps,
  removeOps,
  serializeClipboard,
} from './clipboard';
import { automation, idSource, repeat, step, trigger, uuid } from './editor-fixtures';

function applied(program: Program, ops: Parameters<typeof applyPatch>[1]): Program {
  const result = applyPatch(program, ops, { newId: idSource() });
  if (!result.ok) throw new Error(`${result.code}: ${result.reason}`);
  return result.program;
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

function keysOf(program: Program): string[] {
  return program.body.nodes.map((node) => node.key);
}

function triggerKeys(program: Program): string[] {
  return program.kind === 'automation' ? program.triggers.map((t) => t.key) : [];
}

function wired(): { program: Program; read: FlowNode; use: FlowNode; other: FlowNode } {
  const read = step('read', { level: { lit: 1 } });
  const use = step('use', {
    a: { wire: { from: 'read', port: 'level' } },
    b: { wire: { from: 'other', port: 'value' } },
    c: { lit: 'read.level' },
  });
  const other = step('other');
  return { program: automation([read, use, other]), read, use, other };
}

function branching(): FlowNode {
  return {
    id: uuid(),
    key: 'when',
    kind: 'flow.if',
    branches: [
      {
        id: uuid(),
        when: { wire: { from: 'read', port: 'ok' } },
        scope: { nodes: [step('yes', { v: { wire: { from: 'read', port: 'n' } } })] },
      },
    ],
    outputs: [
      { name: 'o', values: { branch: { wire: { from: 'read', port: 'n' } }, other: { lit: 1 } } },
    ],
  };
}

function switching(): FlowNode {
  return {
    id: uuid(),
    key: 'pick',
    kind: 'flow.switch',
    ports: { subject: { wire: { from: 'read', port: 'n' } } },
    cases: [
      {
        id: uuid(),
        match: { when: { wire: { from: 'read', port: 'big' } } },
        scope: { nodes: [] },
      },
      { id: uuid(), match: { eq: 1 }, scope: { nodes: [step('one')] } },
    ],
  };
}

function trying(): FlowNode {
  return {
    id: uuid(),
    key: 'guard',
    kind: 'flow.try',
    scopes: { try: { nodes: [step('work', { v: { wire: { from: 'read', port: 'n' } } })] } },
    catches: [
      {
        id: uuid(),
        scope: { nodes: [step('recover', { v: { wire: { from: 'read', port: 'n' } } })] },
      },
    ],
  };
}

describe('copy', () => {
  it('returns nothing for an empty or unknown selection', () => {
    const { program } = wired();
    expect(copyPayload(program, [])).toBeUndefined();
    expect(copyPayload(program, [uuid()])).toBeUndefined();
  });

  it('strips every id from steps, rows and nested steps and keeps keys', () => {
    const [first, second, third] = [branching(), switching(), trying()];
    const program = automation([first, second, third]);
    const payload = copyPayload(program, [first.id, second.id, third.id]);
    expect(JSON.stringify(payload)).not.toMatch(/"id"/);
    expect(payload?.entries.map((entry) => entry.node.key)).toEqual(['when', 'pick', 'guard']);
    expect(payload?.entries[1]?.node.cases?.[1]?.scope.nodes[0]?.key).toBe('one');
  });

  it('copies only the outermost selected steps', () => {
    const child = step('child');
    const repeater = repeat('repeater', [child]);
    const program = automation([repeater, step('after')]);
    const payload = copyPayload(program, [child.id, repeater.id]);
    expect(payload?.entries.map((entry) => entry.node.key)).toEqual(['repeater']);
    expect(copyPayload(program, [child.id])?.entries.map((entry) => entry.node.key)).toEqual([
      'child',
    ]);
  });

  it('marks triggers as triggers and keeps program order', () => {
    const press = trigger('press');
    const act = step('act');
    const payload = copyPayload(automation([act], [press]), [act.id, press.id]);
    expect(payload?.entries.map((entry) => [entry.trigger, entry.node.key])).toEqual([
      [true, 'press'],
      [false, 'act'],
    ]);
  });
});

describe('serialisation', () => {
  it('round-trips a payload through text', () => {
    const { program, use } = wired();
    const payload = must(copyPayload(program, [use.id]));
    expect(parseClipboard(serializeClipboard(payload))).toEqual(payload);
  });

  it('rejects text that is not a payload', () => {
    const entry = (node: unknown): string =>
      JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, entries: [{ trigger: false, node }] });
    expect(parseClipboard('not json')).toBeUndefined();
    expect(parseClipboard('{"format":"other"}')).toBeUndefined();
    expect(
      parseClipboard(JSON.stringify({ format: CLIPBOARD_FORMAT, version: 1, entries: [] })),
    ).toBeUndefined();
    expect(parseClipboard(entry({ kind: 'x y' }))).toBeUndefined();
  });
});

describe('paste', () => {
  it('keeps free keys and appends in order', () => {
    const { program, use } = wired();
    const payload = must(copyPayload(program, [use.id]));
    const target = automation([step('first')]);
    const result = pasteOps(payload, target, { in: 'body' });
    expect(result.keys.size).toBe(0);
    expect(keysOf(applied(target, result.ops))).toEqual(['first', 'use']);
  });

  it('renames taken keys and rewrites reads between the pasted steps only', () => {
    const { program, read, use } = wired();
    const payload = must(copyPayload(program, [read.id, use.id]));
    const result = pasteOps(payload, program, { in: 'body', after: 'read' });
    expect([...result.keys]).toEqual([
      ['read', 'read2'],
      ['use', 'use2'],
    ]);
    const next = applied(program, result.ops);
    expect(keysOf(next)).toEqual(['read', 'read2', 'use2', 'use', 'other']);
    expect(next.body.nodes[2]?.ports).toEqual({
      a: { wire: { from: 'read2', port: 'level' } },
      b: { wire: { from: 'other', port: 'value' } },
      c: { lit: 'read.level' },
    });
  });

  it('does not rename into a key the paste itself holds', () => {
    const a = step('a');
    const a2 = step('a2', { x: { wire: { from: 'a', port: 'v' } } });
    const program = automation([a, a2]);
    const payload = must(copyPayload(program, [a.id, a2.id]));
    const result = pasteOps(payload, program, { in: 'body' });
    expect([...result.keys]).toEqual([
      ['a', 'a3'],
      ['a2', 'a22'],
    ]);
    expect(applied(program, result.ops).body.nodes[3]?.ports).toEqual({
      x: { wire: { from: 'a3', port: 'v' } },
    });
  });

  it('rewrites every wire from a renamed key', () => {
    const read = step('read');
    const use = step('use', {
      a: { wire: { from: 'read', port: 'x' } },
      b: { wire: { from: 'read', port: 'y' } },
    });
    const program = automation([read, use]);
    const payload = must(copyPayload(program, [read.id, use.id]));
    const next = applied(program, pasteOps(payload, program, { in: 'body' }).ops);
    expect(next.body.nodes[3]?.ports).toEqual({
      a: { wire: { from: 'read2', port: 'x' } },
      b: { wire: { from: 'read2', port: 'y' } },
    });
  });

  it('rewrites branch and case conditions, outputs and nested steps', () => {
    const [read, first, second] = [step('read'), branching(), switching()];
    const program = automation([read, first, second]);
    const payload = must(copyPayload(program, [read.id, first.id, second.id]));
    const result = pasteOps(payload, program, { in: 'body' });
    expect(result.keys.get('read')).toBe('read2');
    const copies = applied(program, result.ops).body.nodes.slice(3);
    expect(copies.map((node) => node.key)).toEqual(['read2', 'when2', 'pick2']);
    expect(copies[1]).toMatchObject({
      branches: [
        {
          when: { wire: { from: 'read2', port: 'ok' } },
          scope: { nodes: [{ ports: { v: { wire: { from: 'read2', port: 'n' } } } }] },
        },
      ],
      outputs: [{ values: { branch: { wire: { from: 'read2', port: 'n' } }, other: { lit: 1 } } }],
    });
    expect(copies[2]).toMatchObject({
      ports: { subject: { wire: { from: 'read2', port: 'n' } } },
      cases: [{ match: { when: { wire: { from: 'read2', port: 'big' } } } }, { match: { eq: 1 } }],
    });
  });

  it('rewrites scopes and catches and renames copied triggers', () => {
    const [read, guard] = [step('read'), trying()];
    const press = trigger('press');
    const program = automation([read, guard], [press]);
    const payload = must(copyPayload(program, [read.id, guard.id, press.id]));
    const next = applied(program, pasteOps(payload, program, { in: 'body' }).ops);
    expect(next.body.nodes[3]).toMatchObject({
      scopes: { try: { nodes: [{ ports: { v: { wire: { from: 'read2', port: 'n' } } } }] } },
      catches: [{ scope: { nodes: [{ ports: { v: { wire: { from: 'read2', port: 'n' } } } }] } }],
    });
    expect(triggerKeys(next)).toEqual(['press', 'press2']);
  });

  it('accepts pasted text whose steps have no key yet', () => {
    const payload = must(
      parseClipboard(
        JSON.stringify({
          format: CLIPBOARD_FORMAT,
          version: 1,
          entries: [
            { trigger: false, node: { kind: 'device.set' } },
            { trigger: false, node: { kind: 'device.set', key: 'named' } },
          ],
        }),
      ),
    );
    const target = automation([step('first')]);
    const result = pasteOps(payload, target, { in: 'body', after: 'first' });
    expect(result.keys.size).toBe(0);
    expect(keysOf(applied(target, result.ops))).toEqual(['first', 'named', 'deviceSet']);
  });

  it('pastes into a nested scope', () => {
    const source = automation([step('one')]);
    const payload = must(copyPayload(source, [must(source.body.nodes[0]).id]));
    const target = automation([repeat('repeater', [])]);
    const next = applied(target, pasteOps(payload, target, { in: 'repeater.body' }).ops);
    expect(next.body.nodes[0]?.scopes?.['body']?.nodes.map((node) => node.key)).toEqual(['one']);
  });
});

describe('duplicate', () => {
  it('places each copy right after its original with fresh keys', () => {
    const { program, read, other } = wired();
    const ops = duplicateOps(program, [read.id, other.id]);
    expect(keysOf(applied(program, ops))).toEqual(['read', 'read2', 'use', 'other', 'other2']);
  });

  it('copies a step inside a scope and a trigger into the trigger list', () => {
    const child = step('child');
    const press = trigger('press');
    const program = automation([repeat('repeater', [child])], [press]);
    const next = applied(program, duplicateOps(program, [child.id, press.id]));
    expect(next.body.nodes[0]?.scopes?.['body']?.nodes.map((node) => node.key)).toEqual([
      'child',
      'child2',
    ]);
    expect(triggerKeys(next)).toEqual(['press', 'press2']);
  });

  it('shares used keys across copies', () => {
    const one = step('one');
    const two = step('one2');
    const program = automation([one, two]);
    const next = applied(program, duplicateOps(program, [one.id, two.id]));
    expect(new Set(keysOf(next)).size).toBe(4);
  });
});

describe('remove', () => {
  it('removes the outermost selected steps with cascade', () => {
    const child = step('child');
    const repeater = repeat('repeater', [child]);
    const press = trigger('press');
    const program = automation([repeater, step('keep')], [press]);
    expect(removeOps(program, [child.id, repeater.id, press.id])).toEqual([
      { op: 'remove', key: 'press', cascade: true },
      { op: 'remove', key: 'repeater', cascade: true },
    ]);
    expect(removeOps(program, [])).toEqual([]);
  });
});
