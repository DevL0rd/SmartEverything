import { describe, expect, it } from 'vitest';
import { registerStack, stackOfGroup, type StackHandle } from './stack-handles';

function handle(key: string): StackHandle {
  return { key, routeNames: () => [], preload: () => undefined };
}

describe('the stack handles of tab groups', () => {
  it('finds the stack a screen of the group registered while it is mounted', () => {
    const stack = handle('stack-a');
    const forget = registerStack('route-1', '(group-a)', stack);
    expect(stackOfGroup('(group-a)')).toBe(stack);
    expect(stackOfGroup('(group-b)')).toBeNull();
    forget();
    expect(stackOfGroup('(group-a)')).toBeNull();
  });

  it('keeps the stack reachable while any screen of it is still mounted', () => {
    const stack = handle('stack-b');
    const forgetFirst = registerStack('route-1', '(group-c)', stack);
    const forgetSecond = registerStack('route-2', '(group-c)', stack);
    forgetFirst();
    expect(stackOfGroup('(group-c)')).toBe(stack);
    forgetSecond();
    expect(stackOfGroup('(group-c)')).toBeNull();
  });
});
