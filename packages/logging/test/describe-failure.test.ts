import { describe, expect, it } from 'vitest';
import { describeFailure, failureLine, messageOf } from '../src/record';

describe('describing what went wrong', () => {
  it('keeps the name, message and stack of an Error', () => {
    const thrown = new TypeError('not a number');
    const described = describeFailure(thrown);
    expect(described.name).toBe('TypeError');
    expect(described.message).toBe('not a number');
    expect(described.stack).toBeDefined();
  });

  it('reads a failure the database reported, rather than printing an object', () => {
    const described = describeFailure({
      message: 'permission denied for table to_dos',
      code: '42501',
      details: null,
      hint: null,
    });
    expect(described.message).toContain('permission denied for table to_dos');
    expect(described.message).toContain('42501');
  });

  it('carries the details and the hint, which are the useful part', () => {
    const described = describeFailure({
      message: 'could not be done',
      code: 'P0001',
      details: 'nothing was assigned',
      hint: 'assign somebody first',
    });
    expect(described.message).toBe(
      'could not be done (code: P0001, details: nothing was assigned, hint: assign somebody first)',
    );
  });

  it('leaves out what was not reported, rather than printing empty labels', () => {
    const described = describeFailure({ message: 'plain' });
    expect(described.message).toBe('plain');
  });

  it('keeps a name the failure gave itself', () => {
    expect(describeFailure({ name: 'PostgrestError', message: 'nope' }).name).toBe(
      'PostgrestError',
    );
  });

  it('names an unnamed report, so a log line is still readable', () => {
    expect(describeFailure({ message: 'nope' }).name).toBe('ReportedFailure');
  });

  it('falls back to the value itself for something with no message', () => {
    expect(describeFailure({ code: 'X' })).toStrictEqual({
      name: 'UnknownFailure',
      message: '[object Object]',
    });
  });

  it('falls back for a thrown string', () => {
    expect(describeFailure('a string was thrown').message).toBe('a string was thrown');
  });

  it('falls back for nothing at all', () => {
    expect(describeFailure(null).message).toBe('null');
    expect(describeFailure(undefined).message).toBe('undefined');
  });

  it('ignores a message that is not text', () => {
    expect(describeFailure({ message: 404 }).name).toBe('UnknownFailure');
  });

  it('ignores an empty message, which says nothing', () => {
    expect(describeFailure({ message: '' }).name).toBe('UnknownFailure');
  });

  it('ignores a name that is not text', () => {
    expect(describeFailure({ name: 7, message: 'nope' }).name).toBe('ReportedFailure');
  });
});

describe('reading the message of any failure', () => {
  it('returns the message of an Error', () => {
    expect(messageOf(new TypeError('not a number'))).toBe('not a number');
  });

  it('returns the message of an AggregateError, not its members', () => {
    const aggregate = new AggregateError([new Error('first'), new Error('second')], 'two failed');
    expect(messageOf(aggregate)).toBe('two failed');
  });

  it('prints a thrown string or number as text', () => {
    expect(messageOf('refused')).toBe('refused');
    expect(messageOf(42)).toBe('42');
    expect(messageOf(undefined)).toBe('undefined');
  });

  it('reads the message of a reported failure that is not an Error', () => {
    expect(messageOf({ message: 'permission denied', code: '42501' })).toBe(
      'permission denied (code: 42501)',
    );
  });
});

describe('describing a failure on one line', () => {
  it('prefixes an Error with its name', () => {
    expect(failureLine(new RangeError('too large'))).toBe('RangeError: too large');
  });

  it('prints anything else as its message', () => {
    expect(failureLine('refused')).toBe('refused');
  });
});
