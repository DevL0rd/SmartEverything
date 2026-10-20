import { describe, expect, it } from 'vitest';
import { CLEANUP_GRACE_MS } from '@smarteverything/flow/interpret/cancel';
import { Harness, effect, guarded, occurrence, pause, runIdOf, seq } from './support';

const idle = seq(effect('a'));

describe('start bucket', () => {
  it('lets a burst of 10 through and refuses the rest as storm with one warning per minute', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f001';
    const kinds: string[] = [];
    for (let index = 0; index < 14; index += 1) {
      kinds.push(
        h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }))
          .kind,
      );
    }
    await h.settle();
    expect(kinds.filter((kind) => kind === 'started')).toHaveLength(10);
    expect(kinds.filter((kind) => kind === 'refused')).toHaveLength(4);
    expect(h.storms).toEqual([id]);
    expect(h.refused).toHaveLength(0);
  });

  it('refills 30 per minute', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f002';
    for (let index = 0; index < 10; index += 1) {
      h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }));
    }
    expect(
      h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }))
        .kind,
    ).toBe('refused');
    await h.advance(2000);
    expect(
      h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }))
        .kind,
    ).toBe('started');
  });

  it('does not apply when budgets.startBucket is off', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f003';
    for (let index = 0; index < 40; index += 1) {
      const submission = h.driver.submit(
        occurrence({
          body: idle,
          automationId: id,
          startBucket: false,
          policy: { mode: 'parallel' },
        }),
      );
      expect(submission.kind).toBe('started');
    }
    await h.settle();
    expect(h.storms).toHaveLength(0);
  });

  it('is bypassed by manual and urgent starts', () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f004';
    for (let index = 0; index < 10; index += 1) {
      h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }));
    }
    expect(
      h.driver.submit(
        occurrence({ body: idle, automationId: id, manual: true, policy: { mode: 'parallel' } }),
      ).kind,
    ).toBe('started');
    expect(
      h.driver.submit(
        occurrence({ body: idle, automationId: id, urgent: true, policy: { mode: 'parallel' } }),
      ).kind,
    ).toBe('started');
  });

  it('storm B7: thousands of refused occurrences make a handful of decision writes, not one each', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f005';
    for (let index = 0; index < 5000; index += 1) {
      h.driver.submit(occurrence({ body: idle, automationId: id, policy: { mode: 'parallel' } }));
    }
    await h.settle();
    expect(h.started).toHaveLength(10);
    expect(h.decisions.length).toBeLessThanOrEqual(2);
    h.driver.shutdown();
    const total = h.decisions.reduce((sum, row) => sum + (row.times ?? 1), 0);
    expect(total).toBe(4990);
    expect(h.decisions.every((row) => row.reason === 'storm')).toBe(true);
    expect(h.requests.length).toBe(10);
  });
});

describe('feedback guard', () => {
  const chain = (times: number): { automationId: string; runId: string }[] =>
    Array.from({ length: times }, (_, index) => ({
      automationId: '00000000-0000-4000-8000-00000000f010',
      runId: `r${String(index)}`,
    }));

  it('refuses an automation whose cause chain already holds it three times', () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f010';
    expect(
      h.driver.submit(occurrence({ body: idle, automationId: id, causeChain: chain(2) })).kind,
    ).toBe('started');
    const refused = h.driver.submit(
      occurrence({
        body: idle,
        automationId: id,
        causeChain: chain(3),
        policy: { mode: 'parallel' },
      }),
    );
    expect(refused.kind === 'refused' && refused.reason).toBe('feedback');
    expect(h.decisions.at(-1)?.reason).toBe('feedback');
  });

  it('is skipped when budgets.feedback is off', () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f010';
    expect(
      h.driver.submit(
        occurrence({ body: idle, automationId: id, causeChain: chain(5), feedback: false }),
      ).kind,
    ).toBe('started');
  });
});

describe('admit with the trigger payload', () => {
  it('passes the trigger to header.admit and refuses a false answer without any run row', async () => {
    const h = new Harness();
    const seen: unknown[] = [];
    const trigger = {
      source: 'device',
      kind: 'state',
      subject: 'lamp',
      field: 'on',
      value: true,
      previous: false,
      at: '2026-10-18T12:00:00.000Z',
      profileId: null,
      data: {},
    };
    const base = occurrence({
      body: idle,
      admit: (given) => {
        seen.push(given);
        return { ok: true, value: false };
      },
    });
    const refused = h.driver.submit({ ...base, trigger });
    await h.settle();
    expect(seen).toEqual([trigger]);
    expect(refused.kind === 'refused' && refused.reason).toBe('admit_false');
    expect(h.started).toHaveLength(0);
    expect(h.queued).toHaveLength(0);
    expect(h.refused).toHaveLength(0);
    expect(h.decisions[0]?.reason).toBe('admit_false');
  });

  it('counts an admit that fails to evaluate as admit_false', () => {
    const h = new Harness();
    const refused = h.driver.submit(
      occurrence({ body: idle, admit: () => ({ ok: false, class: 'TypeError', message: 'x' }) }),
    );
    expect(refused.kind === 'refused' && refused.reason).toBe('admit_false');
  });

  it('starts when admit holds', async () => {
    const h = new Harness();
    const started = h.driver.submit(
      occurrence({ body: idle, admit: () => ({ ok: true, value: true }) }),
    );
    await h.settle();
    expect(started.kind).toBe('started');
  });
});

describe('refused manual starts', () => {
  it('write an ignored row through the refused port and return the error to the caller', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f020';
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000)), automationId: id }));
    await h.settle();
    const manual = h.driver.submit(occurrence({ body: idle, automationId: id, manual: true }));
    expect(manual.kind).toBe('refused');
    if (manual.kind !== 'refused') return;
    expect(manual.reason).toBe('single_busy');
    expect(manual.error.code).toBe('conflict');
    expect(manual.error.message).toMatch(/already running/);
    expect(h.refused).toEqual([
      expect.objectContaining({ automationId: id, reason: 'single_busy' }),
    ]);
    expect(h.started).toHaveLength(1);
  });

  it('write no row for a refused triggered occurrence, only a decision', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f021';
    h.driver.submit(occurrence({ body: seq(pause('p', 60_000)), automationId: id }));
    await h.settle();
    h.driver.submit(occurrence({ body: idle, automationId: id }));
    expect(h.refused).toHaveLength(0);
    expect(h.decisions.map((row) => row.reason)).toEqual(['single_busy']);
  });
});

describe('modes through the driver', () => {
  it('single counts a parked run as active', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f030';
    h.driver.submit(occurrence({ body: seq(pause('p', 600_000)), automationId: id }));
    await h.settle();
    const second = h.driver.submit(occurrence({ body: idle, automationId: id }));
    expect(second.kind === 'refused' && second.reason).toBe('single_busy');
  });

  it('parallel runs every occurrence when max is absent', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f031';
    for (let index = 0; index < 9; index += 1) {
      h.driver.submit(
        occurrence({
          body: seq(pause('p', 600_000)),
          automationId: id,
          policy: { mode: 'parallel' },
          startBucket: false,
        }),
      );
    }
    await h.settle();
    expect(h.driver.active).toBe(9);
  });

  it('queue starts the next run when the first finishes and drops a stale one', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f032';
    const policy = { mode: 'queue', maxWait: 10_000 } as const;
    const first = h.driver.submit(
      occurrence({ body: seq(pause('p', 20_000)), automationId: id, policy }),
    );
    const second = h.driver.submit(occurrence({ body: idle, automationId: id, policy }));
    expect(second.kind).toBe('queued');
    await h.settle();
    expect(h.queued).toEqual([runIdOf(second)]);
    await h.advance(20_000);
    expect(first.kind).toBe('started');
    expect(h.dropped).toEqual([`${runIdOf(second)}:stale`]);
    expect(h.decisions.map((row) => row.reason)).toContain('stale');
    expect(h.requests).toHaveLength(0);
  });

  it('queue runs the waiting run in time', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f033';
    const policy = { mode: 'queue' } as const;
    h.driver.submit(occurrence({ body: seq(pause('p', 20_000)), automationId: id, policy }));
    const second = h.driver.submit(occurrence({ body: idle, automationId: id, policy }));
    await h.settle();
    await h.advance(20_000);
    expect(h.started).toContain(runIdOf(second));
    expect(h.requests).toHaveLength(1);
  });

  it('restart cancels the running run and starts the new one only after the old one unwound', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f034';
    const policy = { mode: 'restart' } as const;
    const first = h.driver.submit(
      occurrence({ body: seq(pause('p', 600_000)), automationId: id, policy }),
    );
    await h.settle();
    const second = h.driver.submit(
      occurrence({ body: seq(effect('fresh')), automationId: id, policy }),
    );
    await h.settle();
    expect(h.finished[0]).toMatchObject({
      runId: runIdOf(first),
      ending: { status: 'cancelled', reason: 'restart_mode' },
    });
    expect(h.started).toContain(runIdOf(second));
    expect(h.requests.map((request) => request.node.key)).toEqual(['fresh']);
  });

  it('abandons a cleanup that outlives the 30 s grace and logs it', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f035';
    const policy = { mode: 'restart' } as const;
    const body = guarded('t', seq(pause('work', 600_000)), seq(pause('cleanup', 600_000)));
    const first = h.driver.submit(occurrence({ body, automationId: id, policy }));
    await h.settle();
    h.driver.submit(occurrence({ body: seq(effect('fresh')), automationId: id, policy }));
    await h.settle();
    expect(h.finished).toHaveLength(0);
    await h.advance(CLEANUP_GRACE_MS - 1);
    expect(h.finished).toHaveLength(0);
    await h.advance(1);
    expect(h.finished[0]).toMatchObject({ runId: runIdOf(first), ending: { status: 'cancelled' } });
    expect(h.requests.map((request) => request.node.key)).toEqual(['fresh']);
  });

  it('cancelAutomation cancels active runs and drops the queued ones', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f036';
    const policy = { mode: 'queue' } as const;
    h.driver.submit(occurrence({ body: seq(pause('p', 600_000)), automationId: id, policy }));
    const waiting = h.driver.submit(occurrence({ body: idle, automationId: id, policy }));
    await h.settle();
    expect(h.driver.cancelAutomation(id, 'disabled')).toBe(1);
    await h.settle();
    expect(h.dropped).toEqual([`${runIdOf(waiting)}:disabled`]);
    expect(h.finished[0]?.ending.reason).toBe('disabled');
    expect(h.started).toHaveLength(1);
  });
});

describe('recordRun', () => {
  it('is called once per finished live run and never for a dry run of the same automation', async () => {
    const h = new Harness();
    const id = '00000000-0000-4000-8000-00000000f040';
    h.driver.submit(occurrence({ body: idle, automationId: id }));
    h.driver.run(
      occurrence({ body: idle, automationId: id, kind: 'dry' }).start(
        '00000000-0000-4000-8000-0000000000c1',
      ),
    );
    await h.settle();
    expect(h.finished).toHaveLength(2);
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0]?.automationId).toBe(id);
  });
});
