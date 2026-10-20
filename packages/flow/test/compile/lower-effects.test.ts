import { describe, expect, it } from 'vitest';
import { codesOf, wired, lit, make, opOf, problemsOf } from './support';

describe('waits', () => {
  it('lowers a duration wait as durable', () => {
    expect(
      opOf(make('w', 'flow.wait', { duration: wired('d.value'), ifLate: lit('fail') })),
    ).toMatchObject({
      op: 'wait',
      durable: true,
      wait: { kind: 'duration', duration: { wire: { from: 'd', port: 'value' } }, ifLate: 'fail' },
    });
    expect(opOf(make('w', 'flow.wait', { duration: lit(5) }))).toMatchObject({
      wait: { ifLate: 'run' },
    });
  });

  it('lowers a wait until a moment or a time of day', () => {
    expect(
      opOf(make('w', 'flow.wait_until_time', { at: wired('when.value'), grace: lit(1000) })),
    ).toMatchObject({
      wait: {
        kind: 'until_instant',
        at: { wire: { from: 'when', port: 'value' } },
        ifLate: 'skip',
        graceMs: 1000,
      },
    });
    expect(
      opOf(make('w', 'flow.wait_until_time', { clock: lit('19:30'), ifLate: lit('run') })),
    ).toMatchObject({
      wait: { clock: '19:30', at: undefined, ifLate: 'run', graceMs: 300000 },
    });
  });

  it('refuses a wait until with both or neither of a moment and a time of day', () => {
    const both = make('w', 'flow.wait_until_time', { at: wired('x.value'), clock: lit('19:30') });
    const neither = make('n', 'flow.wait_until_time');
    const found = problemsOf([both, neither]);
    expect(found.map((problem) => problem.message)).toEqual([
      'set either "at" or "clock" on a wait until, got both',
      'set either "at" or "clock" on a wait until, got neither',
    ]);
  });

  it('lowers a wait for an event with its matcher and timeout', () => {
    expect(
      opOf(
        make('w', 'flow.wait_event', {
          source: lit('device'),
          kind: lit('changed'),
          subject: lit('lamp'),
          match: lit({ on: true }),
          timeout: lit(9000),
        }),
      ),
    ).toMatchObject({
      wait: {
        kind: 'event',
        matcher: { source: 'device', kind: 'changed', subject: 'lamp', match: { on: true } },
        timeoutMs: 9000,
      },
    });
  });

  it('refuses a wait for an event without a source', () => {
    expect(codesOf([make('w', 'flow.wait_event', { kind: lit('changed') })])).toEqual([
      'missing_port',
      'invalid_literal',
    ]);
  });

  it('lowers a wait for a condition', () => {
    expect(
      opOf(
        make('w', 'flow.wait_condition', {
          condition: wired('empty.value'),
          hold: lit(60000),
          timeout: lit(1000),
        }),
      ),
    ).toMatchObject({
      wait: {
        kind: 'condition',
        condition: { wire: { from: 'empty', port: 'value' } },
        holdMs: 60000,
        timeoutMs: 1000,
      },
    });
    expect(opOf(make('w', 'flow.wait_condition', { condition: lit(true) }))).toMatchObject({
      wait: { holdMs: undefined, timeoutMs: undefined },
    });
  });

  it('carries the node policy on a wait', () => {
    expect(
      opOf(make('w', 'flow.wait', { duration: lit(5) }, { policy: { timeout: 10 } })),
    ).toMatchObject({ policy: { timeout: 10 } });
  });
});

describe('ending steps', () => {
  it('lowers return with its exit and values', () => {
    expect(
      opOf(make('r', 'flow.return', { exit: lit('ok'), level: wired('x.value') })),
    ).toMatchObject({
      op: 'return',
      exit: 'ok',
      values: { level: { wire: { from: 'x', port: 'value' } } },
    });
    expect(opOf(make('r', 'flow.return'))).toMatchObject({ exit: undefined, values: {} });
  });

  it('lowers stop with cancel self and failed', () => {
    expect(
      opOf(
        make('s', 'flow.stop', {
          message: lit('bye'),
          failed: lit(true),
          cancelSelf: lit(true),
        }),
      ),
    ).toMatchObject({ op: 'stop', message: { lit: 'bye' }, failed: true, cancelSelf: true });
    expect(opOf(make('s', 'flow.stop'))).toMatchObject({
      message: undefined,
      failed: false,
      cancelSelf: false,
    });
  });

  it('lowers fail with its class and cause', () => {
    expect(
      opOf(
        make('f', 'flow.fail', {
          message: lit('no'),
          class: lit('Timeout'),
          cause: wired('error.value'),
        }),
      ),
    ).toMatchObject({
      op: 'fail',
      class: 'Timeout',
      cause: { wire: { from: 'error', port: 'value' } },
    });
    expect(opOf(make('f', 'flow.fail', { message: lit('no') }))).toMatchObject({
      class: 'Failed',
      cause: undefined,
    });
  });
});

describe('fixed settings', () => {
  it('reports a missing fixed port, a formula and a value that does not fit', () => {
    const found = problemsOf([
      make('a', 'fn.call'),
      make('b', 'fn.call', { fn: wired('x.value') }),
      make('c', 'fn.call', { fn: lit(4) }),
      make('d', 'flow.stop', { failed: lit('yes') }),
    ]);
    expect(found).toMatchObject([
      { code: 'missing_port', key: 'a', port: 'fn' },
      {
        code: 'static_not_literal',
        key: 'b',
        port: 'fn',
        expected: 'a typed-in value',
      },
      { code: 'invalid_literal', key: 'c', port: 'fn', received: '4' },
      { code: 'invalid_literal', key: 'd', port: 'failed', received: '"yes"' },
    ]);
  });

  it('reports a missing dynamic port and falls back to the kind default', () => {
    expect(problemsOf([make('w', 'flow.wait')])).toMatchObject([
      { code: 'missing_port', port: 'duration' },
    ]);
  });
});
