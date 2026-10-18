import { describe, expect, it } from 'vitest';
import { HarnessRuntimeError } from '@smarteverything/harness';
import { harnessFailure } from '../../src/node/harness-failure';

describe('what a computer tells the hub when a native operation fails', () => {
  it.each(['ownership_lost', 'route_unavailable', 'directory_unavailable'] as const)(
    'keeps the %s reason and its own message',
    (code) => {
      const failure = harnessFailure(new HarnessRuntimeError(code, 'Specific detail.'));

      expect(failure).toStrictEqual({ code, message: 'Specific detail.', retry_at: null });
    },
  );

  it('reports any other error as a failed operation with its message', () => {
    expect(harnessFailure(new Error('Insufficient credits'))).toStrictEqual({
      code: 'operation_failed',
      message: 'Insufficient credits',
      retry_at: null,
    });
  });

  it('keeps the message inside the length the hub accepts and never sends an empty one', () => {
    expect(harnessFailure(new Error('x'.repeat(5000))).message).toHaveLength(2000);
    expect(harnessFailure(new Error('')).message).not.toBe('');
    expect(harnessFailure('boom').message).not.toBe('');
  });
});
