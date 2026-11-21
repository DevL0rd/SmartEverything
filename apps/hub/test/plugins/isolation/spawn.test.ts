import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChildUnavailableError } from '../../../src/plugins/isolation/frames';
import { forkChild } from '../../../src/plugins/isolation/spawn';
import { temporaryDirectory } from '../../support/server';

describe('forking a child program', () => {
  it('refuses a program that is missing and names it', async () => {
    const directory = await temporaryDirectory();
    const entry = join(directory.path, 'missing-worker.mjs');
    const spawn = forkChild({
      kind: 'voice',
      entry,
      output: { source: 'test', scope: 'test.voice', event: 'service.output' },
    });
    try {
      await expect(spawn()).rejects.toThrow(
        new ChildUnavailableError('voice', `its program is missing (${entry})`),
      );
    } finally {
      await directory.remove();
    }
  });
});
