import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EarHostLostError, NoEarHostError } from '../../src/listening/ear-hosts';
import { nearHeardBy } from '../../src/listening/near-score';
import { WakeKeywords } from '../../src/wake-name/keyword-lines';
import { captureLogs, type CapturedLogs } from '../support/logs';

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

interface Asked {
  readonly keywords: readonly string[];
  readonly threshold: number;
  readonly pcm: Int16Array;
}

function scorer(
  names: readonly string[],
  answer: () => Promise<boolean>,
): { readonly asked: Asked[]; readonly hears: ReturnType<typeof nearHeardBy> } {
  const asked: Asked[] = [];
  return {
    asked,
    hears: nearHeardBy({
      keywords: new WakeKeywords(),
      names: () => names,
      hosts: {
        score: (request) => {
          asked.push(request);
          return answer();
        },
      },
      log: new Logger('hub.wake-name'),
    }),
  };
}

describe('scoring a heard line against the near threshold on the ear host', () => {
  it('asks with the hub keyword lines and the near threshold of the sensitivity', async () => {
    const { asked, hears } = scorer(['Coordinator'], () => Promise.resolve(true));
    const pcm = new Int16Array(8);
    await expect(hears(pcm, 'high')).resolves.toBe(true);
    expect(asked).toHaveLength(1);
    expect(asked[0]?.threshold).toBe(0.04);
    expect(asked[0]?.keywords[0]).toMatch(/ @Coordinator$/);
    expect(asked[0]?.pcm).toBe(pcm);
  });

  it('returns what the host heard', async () => {
    const { hears } = scorer(['Coordinator'], () => Promise.resolve(false));
    await expect(hears(new Int16Array(8), 'standard')).resolves.toBe(false);
  });

  it('asks nobody when there is no name to listen for', async () => {
    const { asked, hears } = scorer([], () => Promise.resolve(true));
    await expect(hears(new Int16Array(8), 'standard')).resolves.toBe(false);
    expect(asked).toEqual([]);
  });

  it('warns, naming what is lost, and answers no when no computer hosts ears', async () => {
    const { hears } = scorer(['Coordinator'], () => Promise.reject(new NoEarHostError()));
    await expect(hears(new Int16Array(8), 'standard')).resolves.toBe(false);
    expect(logs.events()).toContain('wake_test.near_not_scored');
    expect(JSON.stringify(logs.records)).toContain('never as almost');
  });

  it('lets any other failure through', async () => {
    const { hears } = scorer(['Coordinator'], () => Promise.reject(new EarHostLostError('desk')));
    await expect(hears(new Int16Array(8), 'standard')).rejects.toBeInstanceOf(EarHostLostError);
  });
});
