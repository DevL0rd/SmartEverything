import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  decisionProgram,
  earlyEndProgram,
  idOf,
  loopProgram,
  note,
  start,
  switchProgram,
  unknownTargetProgram,
} from '../../../model/graph/graph-scene-fixtures';
import { parseGraphIntent } from '../../host/apply-intents';
import {
  UNCONNECTED_TEXT,
  clearIntent,
  connectIntent,
  connectionsOf,
  hasConnections,
  targetChoices,
} from './graph-connections-model';

function nodeOf(program: ProgramV4, key: string): GraphNode {
  const found = program.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

describe('connectionsOf', () => {
  it('lists one row per exec output of an If with Otherwise last', () => {
    const program = decisionProgram();
    const model = connectionsOf(program, nodeOf(program, 'check'), STATIC_KIND_LOOKUP);
    expect(model.rows.map((row) => [row.label, row.target?.key])).toEqual([
      ['If', 'lamp'],
      ['Otherwise', 'dim'],
    ]);
    expect(model.acceptsInput).toBe(true);
  });

  it('lists the Default row of a Switch after its cases', () => {
    const program = switchProgram();
    const model = connectionsOf(program, nodeOf(program, 'mode'), STATIC_KIND_LOOKUP);
    expect(model.rows.map((row) => row.label)).toEqual(['Is bright', 'Is dim', 'Default']);
    expect(model.rows.at(-1)?.target?.key).toBe('c');
  });

  it('says where an unwired exit ends and names a missing step', () => {
    const early = earlyEndProgram();
    const otherwise = connectionsOf(early, nodeOf(early, 'check'), STATIC_KIND_LOOKUP).rows.at(-1);
    expect(otherwise?.targetText).toBe(UNCONNECTED_TEXT);
    expect(otherwise?.target).toBeUndefined();
    const broken = unknownTargetProgram();
    const row = connectionsOf(broken, nodeOf(broken, 'a'), STATIC_KIND_LOOKUP).rows[0];
    expect(row?.targetText).toBe('Missing step "ghost"');
  });

  it('lists every incoming wire with its source', () => {
    const program = decisionProgram();
    const model = connectionsOf(program, nodeOf(program, 'after'), STATIC_KIND_LOOKUP);
    expect(model.incoming.map((row) => row.source.key)).toEqual(['lamp', 'dim']);
    expect(model.incoming[0]?.id).toBe('lamp:next');
    expect(model.incoming[0]?.text).not.toContain(', ');
    const branch = connectionsOf(program, nodeOf(program, 'lamp'), STATIC_KIND_LOOKUP).incoming[0];
    expect(branch?.text).toMatch(/ · .+ path$/);
  });

  it('gives Start no input and value nodes no connections', () => {
    const program = decisionProgram();
    expect(connectionsOf(program, nodeOf(program, 'start'), STATIC_KIND_LOOKUP).acceptsInput).toBe(
      false,
    );
    expect(hasConnections(nodeOf(program, 'sensor'), STATIC_KIND_LOOKUP)).toBe(false);
    expect(hasConnections(nodeOf(program, 'lamp'), STATIC_KIND_LOOKUP)).toBe(true);
  });
});

describe('targetChoices', () => {
  it('offers only steps the wire may reach', () => {
    const program = decisionProgram();
    const keys = targetChoices(program, nodeOf(program, 'check'), 'else', STATIC_KIND_LOOKUP).map(
      (c) => c.key,
    );
    expect(keys).toEqual(['lamp', 'dim', 'after']);
  });

  it('keeps the current target even when it is the only one', () => {
    const program = automation([start('a'), note('a', 'b'), note('b')]);
    expect(
      targetChoices(program, nodeOf(program, 'a'), 'next', STATIC_KIND_LOOKUP).map((c) => c.key),
    ).toEqual(['b']);
  });

  it('refuses circles and steps across a loop boundary', () => {
    const program = loopProgram();
    const outside = targetChoices(program, nodeOf(program, 'done'), 'next', STATIC_KIND_LOOKUP).map(
      (c) => c.key,
    );
    expect(outside).not.toContain('show');
    expect(outside).not.toContain('each');
    expect(outside).not.toContain('start');
    const inside = targetChoices(program, nodeOf(program, 'show'), 'next', STATIC_KIND_LOOKUP).map(
      (c) => c.key,
    );
    expect(inside).not.toContain('done');
  });
});

describe('intents', () => {
  it('builds a connect intent the canvas contract accepts', () => {
    const program = decisionProgram();
    const check = nodeOf(program, 'check');
    const after = { id: idOf('after'), key: 'after', name: 'After' };
    const intent = connectIntent(check, 'else', after);
    expect(parseGraphIntent(intent)).toEqual(intent);
    expect(intent).toEqual({
      type: 'connect',
      request: {
        from: { nodeId: check.id, handle: 'x:else' },
        to: { nodeId: after.id, handle: 'x:in' },
      },
    });
  });

  it('builds a clear intent for one port', () => {
    const program = decisionProgram();
    const check = nodeOf(program, 'check');
    const intent = clearIntent(check, `row:${idOf('check:dark')}`);
    expect(parseGraphIntent(intent)).toEqual(intent);
    expect(intent).toEqual({
      type: 'disconnect',
      request: {
        kind: 'exec',
        from: { nodeId: check.id, handle: `x:row:${idOf('check:dark')}` },
      },
    });
  });
});
