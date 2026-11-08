import { describe, expect, it } from 'vitest';
import { toolFailureOf } from '../../src/plugins/plugin-admin';

describe('toolFailureOf', () => {
  it('carries the reason a tool returned next to its message', () => {
    const failure = toolFailureOf({ error: 'Sign in again.', reason: 'not_authenticated' });
    expect(failure?.code).toBe('upstream_failed');
    expect(failure?.message).toBe('Sign in again.');
    expect(failure?.reason).toBe('not_authenticated');
    expect(failure?.body().error.reason).toBe('not_authenticated');
  });

  it('is a failure without a reason when the tool gave none or gave something else', () => {
    expect(toolFailureOf({ error: 'Busy.' })?.reason).toBeNull();
    expect(toolFailureOf({ error: 'Busy.', reason: 4 })?.reason).toBeNull();
    expect(toolFailureOf({ error: 'Busy.', reason: '' })?.reason).toBeNull();
  });

  it('leaves a result without an error alone', () => {
    expect(toolFailureOf({ status: 'ok', reason: 'x' })).toBeNull();
  });
});
