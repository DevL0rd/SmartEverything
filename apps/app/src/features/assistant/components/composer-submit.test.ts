import { describe, expect, it, vi } from 'vitest';
import { submitPropsOf } from './composer-submit';

describe('submitPropsOf', () => {
  it('sends on the keyboard action and keeps the keyboard open on the phone', () => {
    const send = vi.fn();
    const props = submitPropsOf(true, send);
    expect(props.returnKeyType).toBe('send');
    expect(props.submitBehavior).toBe('submit');
    props.onSubmitEditing?.();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('leaves desktop and web input untouched', () => {
    expect(submitPropsOf(false, vi.fn())).toEqual({});
  });
});
