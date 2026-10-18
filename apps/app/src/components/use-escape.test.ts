import { describe, expect, it } from 'vitest';
import { EscapeStack } from './use-escape';

function layer(
  log: string[],
  name: string,
  eligible = true,
): { run: () => void; eligible: () => boolean } {
  return {
    run: (): void => {
      log.push(name);
    },
    eligible: (): boolean => eligible,
  };
}

describe('escape stack', () => {
  it('fires only the innermost layer, one layer per press', async () => {
    const log: string[] = [];
    const stack = new EscapeStack();
    stack.push(layer(log, 'page'));
    await Promise.resolve();
    stack.push(layer(log, 'sheet'));
    expect(stack.fire()).toBe(true);
    expect(log).toEqual(['sheet']);
  });

  it('falls to the next layer once the innermost has left', async () => {
    const log: string[] = [];
    const stack = new EscapeStack();
    stack.push(layer(log, 'page'));
    await Promise.resolve();
    const leave = stack.push(layer(log, 'sheet'));
    leave();
    stack.fire();
    expect(log).toEqual(['page']);
    expect(stack.size).toBe(1);
  });

  it('skips layers whose scope does not hold focus', () => {
    const log: string[] = [];
    const stack = new EscapeStack();
    stack.push(layer(log, 'page'));
    stack.push(layer(log, 'panel', false));
    stack.fire();
    expect(log).toEqual(['page']);
  });

  it('reports that nothing handled the press when the stack is empty or nothing is eligible', () => {
    const stack = new EscapeStack();
    expect(stack.fire()).toBe(false);
    stack.push(layer([], 'panel', false));
    expect(stack.fire()).toBe(false);
  });

  it('removes a layer once even when its remover runs twice', () => {
    const stack = new EscapeStack();
    stack.push(layer([], 'page'));
    const leave = stack.push(layer([], 'sheet'));
    leave();
    leave();
    expect(stack.size).toBe(1);
  });

  it('fires the inner layer when its effect ran first in the same commit', () => {
    const log: string[] = [];
    const stack = new EscapeStack();
    stack.push(layer(log, 'list'));
    stack.push(layer(log, 'container'));
    stack.fire();
    expect(log).toEqual(['list']);
  });

  it('fires a layer activated in a later commit before one from an earlier commit', async () => {
    const log: string[] = [];
    const stack = new EscapeStack();
    stack.push(layer(log, 'page'));
    await Promise.resolve();
    stack.push(layer(log, 'sheet'));
    stack.fire();
    expect(log).toEqual(['sheet']);
  });
});
