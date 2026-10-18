import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from '../../../store/state';
import { lightCommandsOf } from './light-commands';

function entry(failure: string | null): LedgerEntry {
  return { commandId: 'command', value: 50, expiresAt: null, failure };
}

describe('lightCommandsOf', () => {
  it('reports nothing for a light without open commands', () => {
    expect(lightCommandsOf([])).toEqual({ failed: false, waiting: false });
  });

  it('marks a light as waiting while a command has no outcome', () => {
    expect(lightCommandsOf([entry(null)])).toEqual({ failed: false, waiting: true });
  });

  it('marks a light as failed when any command did not run', () => {
    expect(lightCommandsOf([entry(null), entry('It did not run in time.')])).toEqual({
      failed: true,
      waiting: true,
    });
    expect(lightCommandsOf([entry('Refused')])).toEqual({ failed: true, waiting: false });
  });
});
