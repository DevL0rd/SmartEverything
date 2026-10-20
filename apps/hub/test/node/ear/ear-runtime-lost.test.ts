import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type { WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ear } from '../../../src/node/ear/ear';
import { isWasmAbort } from '../../../src/node/ear/runtime-lost';
import { captureLogs } from '../../support/logs';
import type { WakeGrant } from '../../../src/wake-name/wake-claims';
import { realSpotter } from './real-spotter';

const FRAME = 512;

class FailingModel implements Model {
  constructor(private readonly message: string) {}

  process(): Promise<never> {
    return Promise.reject(new Error(this.message));
  }

  reset_state(): void {
    return;
  }

  release(): Promise<void> {
    return Promise.resolve();
  }
}

function failing(message: string): () => Promise<Model> {
  return (): Promise<Model> => Promise.resolve(new FailingModel(message));
}

async function hearOne(message: string, lost: string[]): Promise<void> {
  const ear = new Ear(
    {
      claims: {
        request: (): WakeGrant => ({ granted: false, onSuperseded: (): void => undefined }),
      },
      spotter: realSpotter().spotter,
      model: failing(message),
      pauseMs: (): 200 => 200,
      clock: { now: (): Date => new Date(0), at: (): (() => void) => (): void => undefined },
      log: new Logger('hub.wake-name'),
      lost: (reason): void => {
        lost.push(reason);
      },
    },
    {
      claim: { source: 'camera', key: 'living' },
      fields: { cameraId: 'living' },
      sensitivity: (): WakeSensitivity => 'standard',
      resting: (): boolean => false,
      wake: (): void => undefined,
      speech: null,
    },
  );
  await ear.open();
  ear.hear(new Int16Array(FRAME));
  await ear.close();
}

beforeEach(() => {
  captureLogs();
});

afterEach(() => {
  Logger.reset();
});

describe('an ear whose speech runtime died', () => {
  it('reports a WebAssembly abort as lost so the service can restart', async () => {
    const lost: string[] = [];
    await hearOne('Aborted(). Build with -sASSERTIONS for more info.', lost);
    expect(lost).toEqual(['Aborted(). Build with -sASSERTIONS for more info.']);
  });

  it('keeps going after an ordinary detection failure', async () => {
    const lost: string[] = [];
    await hearOne('input tensor has the wrong shape', lost);
    expect(lost).toEqual([]);
  });

  it('recognises only the abort message', () => {
    expect(isWasmAbort('Aborted()')).toBe(true);
    expect(isWasmAbort('the run Aborted(')).toBe(false);
  });
});
