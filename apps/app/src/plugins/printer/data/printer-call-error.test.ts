import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { PrinterCallError, printerCallErrorOf } from './printer-call-error';

describe('printerCallErrorOf', () => {
  it('turns a refusal that carries the printer reason into a printer call error', () => {
    const error = printerCallErrorOf(
      new ApiError('upstream_failed', 'The printer wants a sign-in.', 'not_authenticated'),
    );
    expect(error).toBeInstanceOf(PrinterCallError);
    expect(error).toMatchObject({
      message: 'The printer wants a sign-in.',
      reason: 'not_authenticated',
    });
  });

  it('does not touch a refusal without a reason or any other failure', () => {
    expect(printerCallErrorOf(new ApiError('forbidden', 'Only an owner.'))).toBeNull();
    expect(printerCallErrorOf(new Error('offline'))).toBeNull();
  });
});
