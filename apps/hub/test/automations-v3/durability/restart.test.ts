import { restoreRunState } from '@smarteverything/flow/state/run-state';
import { describe, expect, it } from 'vitest';
import { shutdownRuns } from '../../../src/automations/driver/boot';
import { CommandsRepository } from '../../../src/store/repositories/commands';
import {
  Home,
  Hub,
  MINUTE,
  SECOND,
  addAutomation,
  at,
  database,
  effect,
  level,
  polling,
  row,
  seq,
  sleep,
} from './support';
import type { Database, IfLate } from './support';

async function parkedThenRestarted(
  body: ReturnType<typeof seq>,
  prepare: (db: Database) => void = () => undefined,
): Promise<{ first: Hub; second: Hub; runId: string; db: Database; home: Home }> {
  const db = database();
  const home = new Home();
  const first = new Hub(db, home);
  const runId = first.begin(addAutomation(db, body));
  await first.settle();
  prepare(db);
  const second = new Hub(db, home);
  return { first, second, runId, db, home };
}

describe('boot after a restart', () => {
  it('resumes a waiting run, re-arms its wake and finishes it once', async () => {
    const { second, runId, db, home } = await parkedThenRestarted(
      seq(sleep('long', MINUTE), effect('after')),
    );
    expect(second.boot()).toStrictEqual({ resumed: 1, cancelled: 0, interrupted: 0 });
    await second.advance(MINUTE - SECOND);
    expect(home.effects).toStrictEqual([]);
    await second.advance(SECOND);
    expect(home.effects).toHaveLength(1);
    expect(row(db, runId).status).toBe('succeeded');
  });

  it.each<[IfLate, number, string]>([
    ['run', 1, 'succeeded'],
    ['skip', 0, 'succeeded'],
    ['fail', 0, 'failed'],
  ])(
    'handles a wake that is overdue after the restart with ifLate %s',
    async (ifLate, ran, status) => {
      const { second, runId, db, home } = await parkedThenRestarted(
        seq(sleep('late', MINUTE, { ifLate }), effect('after')),
        (held) => {
          held.clock.jumpTo('2026-10-18T12:10:00.000Z');
        },
      );
      second.boot();
      await second.advance(0);
      expect(home.effects).toHaveLength(ran);
      expect(row(db, runId).status).toBe(status);
    },
  );

  it('re-subscribes a level wait and lets it pass when the state is already true', async () => {
    const { second, runId, db, home } = await parkedThenRestarted(
      seq(level('until-on'), effect('after')),
      () => undefined,
    );
    home.watched.length = 0;
    home.level = true;
    second.boot();
    await second.settle();
    const [watcher] = home.watched;
    expect(watcher?.wait).toMatchObject({ kind: 'condition' });
    expect(home.effects).toHaveLength(1);
    expect(row(db, runId).status).toBe('succeeded');
  });

  it('keeps the loop deadline across a restart', async () => {
    const body = seq(polling('poll', 10 * SECOND, 25 * SECOND, effect('tick')));
    const { first, second, runId, db, home } = await parkedThenRestarted(body);
    const saved = restoreRunState(JSON.stringify(row(db, runId).state));
    const deadline = saved.frames.find((frame) => frame.loop !== undefined)?.loop?.deadlineAt;
    expect(deadline).toBe(Date.parse('2026-10-18T12:00:25.000Z'));
    expect(first.requests).toHaveLength(1);
    db.clock.jumpTo('2026-10-18T12:00:20.000Z');
    expect(second.boot().resumed).toBe(1);
    await second.advance(0);
    await second.advance(30 * SECOND);
    expect(row(db, runId).status).toBe('succeeded');
    expect(home.effects.length).toBeLessThanOrEqual(3);
  });

  it('interrupts every active row that was not waiting, including queued runs', async () => {
    const { second, db } = await parkedThenRestarted(seq(sleep('long', MINUTE)));
    const other = addAutomation(db, seq(effect('x')));
    const common = {
      automationId: other.id,
      revision: 1,
      ownerProfileId: null,
      mode: 'live' as const,
      planHash: other.hash,
    };
    const running = db.records.create({ ...common, status: 'running' });
    const queued = db.records.create({ ...common, status: 'queued' });
    second.boot();
    for (const id of [running.id, queued.id]) {
      expect(row(db, id)).toMatchObject({
        status: 'interrupted',
        error: 'The hub stopped before this run finished. Its actions were not replayed.',
      });
    }
  });

  it('fails the open commands of an interrupted run without replaying them', async () => {
    const { second, db } = await parkedThenRestarted(seq(sleep('long', MINUTE)));
    const other = addAutomation(db, seq(effect('x')));
    const run = db.records.create({
      automationId: other.id,
      revision: 1,
      ownerProfileId: null,
      mode: 'live',
      planHash: other.hash,
      status: 'running',
    });
    const [command] = new CommandsRepository(db.context).insert([
      { deviceId: null, capability: 'power', value: true, source: 'automation', requestedBy: null },
    ]);
    if (command === undefined) throw new Error('No command was stored.');
    db.context.sql.run(
      'retain the command',
      'insert into automation_run_commands(run_id, command_id) values ($run, $command)',
      { run: run.id, command: command.id },
    );
    second.boot();
    expect(new CommandsRepository(db.context).byId(command.id)).toMatchObject({
      status: 'failed',
      error: 'The hub stopped before the owned command outcome was known. It was not replayed.',
    });
  });

  it('interrupts a waiting run whose plan is gone with a named error', async () => {
    const { second, runId, db, home } = await parkedThenRestarted(
      seq(sleep('long', MINUTE), effect('after')),
      (held) => {
        held.sql.run('drop the plan', 'update automation_runs set plan_hash = null where 0');
        held.sql.run('drop the plan', 'delete from automation_plans');
      },
    );
    expect(second.boot()).toStrictEqual({ resumed: 0, cancelled: 0, interrupted: 1 });
    const saved = row(db, runId);
    expect(saved.status).toBe('interrupted');
    expect(saved.error).toContain('RunResumeError');
    expect(saved.error).toContain('is not stored');
    expect(saved.state).toBeNull();
    await second.advance(MINUTE);
    expect(home.effects).toStrictEqual([]);
  });

  it('interrupts a waiting run whose saved state cannot be read', async () => {
    const { second, runId, db } = await parkedThenRestarted(
      seq(sleep('long', MINUTE), effect('after')),
      (held) => {
        held.sql.run('damage the state', `update automation_runs set state = '{"runId":1}'`);
      },
    );
    second.boot();
    const saved = row(db, runId);
    expect(saved.status).toBe('interrupted');
    expect(saved.error).toContain('cannot be read');
  });

  it('cancels a waiting run of a disabled automation through its finally', async () => {
    const body = seq({
      op: 'try',
      at: at('guarded'),
      body: sleep('long', MINUTE),
      catches: [],
      finally: effect('cleanup'),
    });
    const { second, runId, db, home } = await parkedThenRestarted(body, (held) => {
      held.enabled.clear();
    });
    expect(second.boot()).toStrictEqual({ resumed: 0, cancelled: 1, interrupted: 0 });
    await second.settle();
    expect(home.effects).toStrictEqual(['cleanup']);
    expect(row(db, runId).status).toBe('cancelled');
  });
});

describe('shutdown', () => {
  it('keeps waiting rows and cancels the runs that are only running', async () => {
    const db = database();
    const home = new Home();
    const hub = new Hub(db, home);
    const waiting = hub.begin(addAutomation(db, seq(sleep('long', MINUTE), effect('after'))));
    const brief = hub.begin(addAutomation(db, seq(sleep('brief', SECOND), effect('after'))));
    await hub.settle();
    shutdownRuns(hub.driver, hub.parks);
    await hub.settle();
    await hub.advance(2 * MINUTE);
    expect(row(db, waiting)).toMatchObject({ status: 'waiting' });
    expect(row(db, waiting).state).not.toBeNull();
    expect(row(db, brief).status).toBe('cancelled');
    expect(home.effects).toStrictEqual([]);
    const next = new Hub(db, home);
    expect(next.boot().resumed).toBe(1);
    expect(row(db, waiting).status).toBe('waiting');
    await next.advance(0);
    expect(row(db, waiting).status).toBe('succeeded');
    expect(home.effects).toStrictEqual(['after']);
  });
});

describe('temporary regions across a restart', () => {
  it('interrupts a run inside a region instead of resuming it', async () => {
    const { second, runId, db, home } = await parkedThenRestarted(
      seq(effect('apply'), sleep('hold', 10 * MINUTE, { durable: false }), effect('revert')),
    );
    expect(row(db, runId)).toMatchObject({ status: 'running', state: null });
    expect(second.boot()).toStrictEqual({ resumed: 0, cancelled: 0, interrupted: 0 });
    expect(row(db, runId)).toMatchObject({
      status: 'interrupted',
      error: 'The hub stopped before this run finished. Its actions were not replayed.',
    });
    await second.advance(10 * MINUTE);
    expect(home.effects).toStrictEqual(['apply']);
  });
});
