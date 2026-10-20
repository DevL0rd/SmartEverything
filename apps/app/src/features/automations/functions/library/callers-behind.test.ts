import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { Ids, automation } from '../../model/canvas/canvas-fixtures';
import { callersBehind } from './callers-behind';

function call(functionId: string, pin?: number): FlowNode {
  return {
    ...new Ids(40).next(),
    kind: 'fn.call',
    ports: { fn: { lit: functionId }, ...(pin === undefined ? {} : { pin: { lit: pin } }) },
  };
}

const FUNCTIONS = [
  { id: 'a', revision: 3 },
  { id: 'b', revision: 2 },
];

describe('callersBehind', () => {
  it('lists functions that a caller keeps on an older revision', () => {
    const behind = callersBehind([automation([call('a', 2), call('b', 2)])], FUNCTIONS);
    expect([...behind]).toEqual(['a']);
  });

  it('ignores callers that follow the latest or are unknown', () => {
    const behind = callersBehind([automation([call('a'), call('gone', 1)])], FUNCTIONS);
    expect(behind.size).toBe(0);
  });
});
