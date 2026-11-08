import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import type { LogRecord } from '@smarteverything/logging';
import type { HarnessRuntimeEvent } from '../src/host/events';
import { bootRuntime, turnsFinished } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

let fixture: RuntimeFixture | undefined;

afterEach(async () => {
  await fixture?.dispose();
  fixture = undefined;
  Logger.reset();
});

function contextEstimates(events: readonly HarnessRuntimeEvent[]): readonly (number | null)[] {
  return events.flatMap((event) => (event.kind === 'context' ? [event.estimate] : []));
}

function estimateFailures(records: readonly LogRecord[]): readonly LogRecord[] {
  return records.filter((record) => record.event === 'context.estimate_unavailable');
}

async function compactedSession(host: RuntimeFixture): Promise<void> {
  const session = await host.runtime.create(host.sessionOptions());
  host.model.script(
    { kind: 'text', text: 'First answer.' },
    { kind: 'text', text: 'Second answer.' },
    { kind: 'text', text: 'The compacted summary.' },
  );
  session.text('First question.');
  await turnsFinished(host, session, 1);
  session.text('Second question.');
  await turnsFinished(host, session, 2);
  const compacted = await session.command('/compact', []);
  expect(compacted?.result.kind).toBe('success');
}

describe('a compaction ending on the booted harness context', () => {
  it('reports the measured context estimate instead of a dependency failure', async () => {
    const logged: LogRecord[] = [];
    Logger.configure({ sink: (record) => logged.push(record) });
    const host = await bootRuntime();
    fixture = host;

    await compactedSession(host);

    const estimates = contextEstimates(host.events);
    expect(estimates).toHaveLength(1);
    const [estimate] = estimates;
    expect(estimate).toEqual(expect.any(Number));
    expect(Number.isInteger(estimate)).toBe(true);
    expect(estimate).toBeGreaterThan(0);
    expect(estimateFailures(logged)).toStrictEqual([]);
  });
});
