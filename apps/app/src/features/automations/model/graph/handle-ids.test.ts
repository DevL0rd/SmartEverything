import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { execPortsOf } from '@smarteverything/domain';
import {
  conditionHandle,
  execInHandle,
  execOutHandle,
  formatHandle,
  parseHandle,
  valueInHandle,
  valueOutHandle,
  type HandleRef,
} from './handle-ids';
import {
  decisionProgram,
  forkProgram,
  laneRowsProgram,
  loopProgram,
  switchProgram,
  tryProgram,
} from './graph-scene-fixtures';

const ID = '00000000-0000-4000-8000-000000000001';

describe('handle ids', () => {
  it('formats every handle of the scheme', () => {
    expect(execInHandle()).toBe('x:in');
    expect(execOutHandle('next')).toBe('x:next');
    expect(execOutHandle(`row:${ID}`)).toBe(`x:row:${ID}`);
    expect(execOutHandle(`case:${ID}`)).toBe(`x:case:${ID}`);
    expect(execOutHandle(`catch:${ID}`)).toBe(`x:catch:${ID}`);
    expect(execOutHandle('path:left')).toBe('x:path:left');
    expect(valueInHandle('message')).toBe('v:message');
    expect(conditionHandle('row', ID)).toBe(`v:row:${ID}:when`);
    expect(conditionHandle('case', ID)).toBe(`v:case:${ID}:when`);
    expect(valueOutHandle('item')).toBe('o:item');
  });

  it('parses every handle back to the reference it was built from', () => {
    const refs: readonly HandleRef[] = [
      { kind: 'execIn' },
      { kind: 'execOut', port: 'timedOut' },
      { kind: 'execOut', port: `row:${ID}` },
      { kind: 'execOut', port: 'path:left' },
      { kind: 'valueIn', port: 'message' },
      { kind: 'condition', group: 'row', id: ID },
      { kind: 'condition', group: 'case', id: ID },
      { kind: 'valueOut', name: 'last' },
    ];
    for (const ref of refs) expect(parseHandle(formatHandle(ref))).toEqual(ref);
  });

  it('round trips generated names', () => {
    const name = fc.stringMatching(/^[a-z][A-Za-z0-9_]{0,12}$/);
    fc.assert(
      fc.property(name, (port) => {
        expect(parseHandle(valueInHandle(port))).toEqual({ kind: 'valueIn', port });
        expect(parseHandle(valueOutHandle(port))).toEqual({ kind: 'valueOut', name: port });
        expect(parseHandle(execOutHandle(`path:${port}`))).toEqual({
          kind: 'execOut',
          port: `path:${port}`,
        });
        expect(formatHandle({ kind: 'condition', group: 'case', id: port })).toBe(
          conditionHandle('case', port),
        );
      }),
      { numRuns: 20 },
    );
  });

  it('refuses text that is not a handle', () => {
    for (const bad of ['', 'x:', 'v:', 'o:', 'q:in', 'v:row::when', 'v:row:a:b:when', 'o:a:b']) {
      expect(parseHandle(bad)).toBeUndefined();
    }
  });

  it('matches the exec output handles the domain reports for every card family', () => {
    const programs = [
      decisionProgram(),
      switchProgram(),
      loopProgram(),
      tryProgram(),
      laneRowsProgram(),
      forkProgram('all'),
    ];
    const checked = programs.flatMap((program) =>
      program.nodes.flatMap((node) => execPortsOf(node.kind, node, STATIC_KIND_LOOKUP).outputs),
    );
    expect(checked.length).toBeGreaterThan(10);
    for (const out of checked) expect(execOutHandle(out.port)).toBe(out.handle);
  });
});
