import { describe, expect, it } from 'vitest';
import { DURABLE_PARK_MS } from '../../../src/automations/driver/park-store';
import {
  Home,
  Hub,
  MINUTE,
  SECOND,
  addAutomation,
  database,
  effect,
  level,
  row,
  seq,
  sleep,
} from './support';

async function started(body: ReturnType<typeof seq>): Promise<{
  hub: Hub;
  runId: string;
}> {
  const db = database();
  const hub = new Hub(db, new Home());
  const runId = hub.begin(addAutomation(db, body));
  await hub.settle();
  return { hub, runId };
}

describe('durable parks', () => {
  it('checkpoints a long duration wait with its absolute wake time', async () => {
    const { hub, runId } = await started(seq(sleep('long', MINUTE), effect('after')));
    const saved = row(hub.db, runId);
    expect(saved.status).toBe('waiting');
    expect(saved.wake_at).toBe(
      new Date(Date.parse('2026-10-18T12:00:00.000Z') + MINUTE).toISOString(),
    );
    expect(saved.waiting_on).toMatchObject({ kind: 'duration' });
    expect(saved.state).not.toBeNull();
  });

  it('does not checkpoint a wait shorter than the durable threshold', async () => {
    const { hub, runId } = await started(seq(sleep('short', DURABLE_PARK_MS - 1), effect('after')));
    const saved = row(hub.db, runId);
    expect(saved.status).toBe('running');
    expect(saved.state).toBeNull();
  });

  it('checkpoints a wait exactly at the durable threshold', async () => {
    const { hub, runId } = await started(seq(sleep('edge', DURABLE_PARK_MS), effect('after')));
    expect(row(hub.db, runId).status).toBe('waiting');
  });

  it('never checkpoints a wait the plan marks not durable, however long', async () => {
    const { hub, runId } = await started(
      seq(sleep('region', 10 * MINUTE, { durable: false }), effect('after')),
    );
    const saved = row(hub.db, runId);
    expect(saved.status).toBe('running');
    expect(saved.state).toBeNull();
    expect(saved.wake_at).toBeNull();
  });

  it('checkpoints a level wait that has no fixed wake', async () => {
    const { hub, runId } = await started(seq(level('until-on'), effect('after')));
    const saved = row(hub.db, runId);
    expect(saved.status).toBe('waiting');
    expect(saved.wake_at).toBeNull();
    expect(saved.waiting_on).toMatchObject({ kind: 'condition' });
  });

  it('clears the saved state in the same write that marks the run running again', async () => {
    const { hub, runId } = await started(
      seq(sleep('long', MINUTE), sleep('brief', SECOND), effect('after')),
    );
    await hub.advance(MINUTE);
    const resumed = row(hub.db, runId);
    expect(resumed.status).toBe('running');
    expect(resumed.state).toBeNull();
    expect(resumed.wake_at).toBeNull();
    expect(resumed.waiting_on).toBeNull();
    await hub.advance(SECOND);
    expect(row(hub.db, runId).status).toBe('succeeded');
  });

  it('keeps the checkpoint of a run stopped while it waits until the run ends', async () => {
    const { hub, runId } = await started(seq(sleep('long', MINUTE), effect('after')));
    hub.driver.cancel(runId, 'user_stop');
    await hub.settle();
    const ended = row(hub.db, runId);
    expect(ended.status).toBe('cancelled');
    expect(ended.state).toBeNull();
    expect(hub.parks.kept.has(runId)).toBe(false);
  });
});
