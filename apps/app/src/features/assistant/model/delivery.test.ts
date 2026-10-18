import { describe, expect, it } from 'vitest';
import { deliveryOf } from './delivery';

describe('deliveryOf', () => {
  it('shows a message sent while the AI works as queued, then delivered', () => {
    expect(deliveryOf({ state: 'queued' }, true)).toBe('queued');
    expect(deliveryOf({ state: 'delivered' }, true)).toBe('delivered');
  });

  it('then seen once the AI answers it', () => {
    expect(deliveryOf({ state: 'working' }, true)).toBe('seen');
    expect(deliveryOf({ state: 'answered' }, false)).toBe('seen');
  });

  it('never calls an idle-time message queued', () => {
    expect(deliveryOf({ state: 'queued' }, false)).toBe('sent');
    expect(deliveryOf({ state: 'delivered' }, false)).toBe('sent');
  });

  it('keeps failure first', () => {
    expect(deliveryOf({ state: 'failed' }, true)).toBe('failed');
  });
});
