import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { background, setBackgroundScope } from '../src/background';
import { Logger } from '../src/logger';
import type { LogRecord } from '../src/record';

let written: LogRecord[] = [];

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  written = [];
  Logger.configure({
    level: 'trace',
    sink: (record) => {
      written.push(record);
    },
  });
  setBackgroundScope('hub.jobs');
});

afterEach(() => {
  Logger.reset();
});

describe('background', () => {
  it('logs a rejection once with the error name, message and fields', async () => {
    background(Promise.reject(new TypeError('boom')), 'routes.refresh_failed', { id: 'a' });
    await settle();
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      event: 'routes.refresh_failed',
      scope: 'hub.jobs',
      level: 'error',
      payload: { id: 'a' },
      failure: { name: 'TypeError', message: 'boom' },
    });
  });

  it('stays silent when the promise resolves', async () => {
    background(Promise.resolve(1), 'routes.refresh_failed');
    await settle();
    expect(written).toEqual([]);
  });

  it('does not throw when the value throws synchronously', () => {
    const hostile = {
      then: (): never => {
        throw new Error('sync');
      },
    };
    expect(() => {
      background(hostile, 'routes.refresh_failed');
    }).not.toThrow();
    expect(written).toHaveLength(1);
    expect(written[0]?.failure?.message).toBe('sync');
  });

  it('does not throw on an invalid event name and still logs the failure', async () => {
    expect(() => {
      background(Promise.reject(new Error('x')), 'Not Valid');
    }).not.toThrow();
    await settle();
    expect(written).toHaveLength(1);
    expect(written[0]?.event).toBe('background.failed');
    expect(written[0]?.payload).toMatchObject({ event: 'Not Valid' });
  });

  it('does nothing when there is no work', () => {
    expect(() => {
      background(undefined, 'routes.refresh_failed');
    }).not.toThrow();
    expect(written).toEqual([]);
  });
});
