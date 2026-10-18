import { describe, expect, it, vi } from 'vitest';
import { SharedSource } from './shared-source';

function harness(): {
  readonly source: SharedSource;
  readonly attached: () => number;
  readonly detached: () => number;
  readonly fire: () => void;
} {
  let attached = 0;
  let detached = 0;
  let notify: (() => void) | null = null;
  const source = new SharedSource((next) => {
    attached += 1;
    notify = next;
    return (): void => {
      detached += 1;
      notify = null;
    };
  });
  return {
    source,
    attached: () => attached,
    detached: () => detached,
    fire: (): void => {
      notify?.();
    },
  };
}

describe('SharedSource', () => {
  it('registers one native subscription for many subscribers', () => {
    const { source, attached, fire } = harness();
    const calls = vi.fn();
    const offs = Array.from({ length: 112 }, () =>
      source.subscribe(() => {
        calls();
      }),
    );
    expect(attached()).toBe(1);
    fire();
    expect(calls).toHaveBeenCalledTimes(112);
    offs.forEach((off) => {
      off();
    });
  });

  it('detaches with the last subscriber and attaches again on the next', () => {
    const { source, attached, detached } = harness();
    const first = source.subscribe(() => undefined);
    const second = source.subscribe(() => undefined);
    first();
    expect(detached()).toBe(0);
    second();
    expect(detached()).toBe(1);
    source.subscribe(() => undefined);
    expect(attached()).toBe(2);
  });

  it('lets a listener unsubscribe while notifying', () => {
    const { source, fire } = harness();
    const later = vi.fn();
    const off = source.subscribe(() => {
      off2();
    });
    const off2 = source.subscribe(later);
    fire();
    expect(later).toHaveBeenCalledTimes(1);
    off();
  });
});
