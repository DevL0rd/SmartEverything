import { describe, expect, it } from 'vitest';
import { buildRegistry, nodeCatalogue, type NodeKind } from '../../src/automation-nodes';
import { FLOW_KINDS, FLOW_SCOPE_OUTPUTS } from '../../src/automation-nodes/flow';
import {
  WAIT_UNTIL_GRACE_MS,
  compileWaitEventMatcher,
  waitUntilTimeError,
} from '../../src/automation-nodes/flow-waits';
import { FLOW_TYPE } from '../../src/automation-v3/types';

const registry = buildRegistry(FLOW_KINDS);

function kind(id: string): NodeKind {
  const found = registry.get(id);
  if (found === undefined) throw new Error(`missing ${id}`);
  return found;
}

function inputNames(id: string): readonly string[] {
  return kind(id).inputs.map((port) => port.name);
}

function port(id: string, name: string): NodeKind['inputs'][number] {
  const found = kind(id).inputs.find((each) => each.name === name);
  if (found === undefined) throw new Error(`missing port ${id}.${name}`);
  return found;
}

function choiceIds(id: string, name: string): readonly string[] {
  const type = port(id, name).type;
  if (type.t !== 'choice') throw new Error(`${id}.${name} is not a choice`);
  return type.options.map((each) => each.id);
}

describe('flow kinds', () => {
  it('lists exactly the nineteen v1 flow kinds, without yield or forever', () => {
    expect(FLOW_KINDS.map((each) => each.id).sort()).toEqual(
      [
        'flow.if',
        'flow.switch',
        'flow.guard',
        'flow.for_each',
        'flow.repeat',
        'flow.for_range',
        'flow.while',
        'flow.do_until',
        'flow.break',
        'flow.continue',
        'flow.parallel',
        'flow.try',
        'flow.wait',
        'flow.wait_until_time',
        'flow.wait_event',
        'flow.wait_condition',
        'flow.return',
        'flow.stop',
        'flow.fail',
      ].sort(),
    );
    expect(registry.has('flow.yield')).toBe(false);
    expect(registry.has('flow.forever')).toBe(false);
  });

  it('are shipped member control kinds in the flow category', () => {
    for (const each of FLOW_KINDS) {
      expect(each.class).toBe('control');
      expect(each.category).toBe('flow');
      expect(each.tier).toBe('v1');
      expect(each.access).toBe('member');
      expect(each.effect).toBeUndefined();
    }
    expect(nodeCatalogue(registry, { group: 'flow' })).toHaveLength(19);
  });

  it('declare port types that parse as flow types', () => {
    for (const each of FLOW_KINDS) {
      for (const declared of [...each.inputs, ...each.outputs]) {
        expect(FLOW_TYPE.safeParse(declared.type).success).toBe(true);
      }
    }
    for (const outputs of Object.values(FLOW_SCOPE_OUTPUTS)) {
      for (const declared of outputs) expect(FLOW_TYPE.safeParse(declared.type).success).toBe(true);
    }
  });

  it('give if and switch their else and default scopes and no ports of their own for rows', () => {
    expect(kind('flow.if').scopes).toEqual({ required: [], optional: ['else'] });
    expect(inputNames('flow.if')).toEqual([]);
    expect(kind('flow.switch').scopes).toEqual({ required: [], optional: ['default'] });
    expect(inputNames('flow.switch')).toEqual(['subject', 'mode']);
    expect(choiceIds('flow.switch', 'mode')).toEqual(['first', 'all']);
    expect(port('flow.switch', 'mode').default).toBe('first');
  });

  it('makes guard quiet by default and requires its condition', () => {
    expect(port('flow.guard', 'condition').required).toBe(true);
    expect(port('flow.guard', 'quietly').default).toBe(true);
    expect(kind('flow.guard').scopes).toBeUndefined();
  });

  it('gives for each a snapshot list, unbounded concurrency, reverse, collect and results', () => {
    expect(inputNames('flow.for_each')).toEqual(['items', 'concurrency', 'reverse', 'collect']);
    expect(port('flow.for_each', 'concurrency').default).toBe(1);
    expect(port('flow.for_each', 'concurrency').type).toEqual({
      t: 'number',
      integer: true,
      min: 1,
    });
    expect(port('flow.for_each', 'reverse').default).toBe(false);
    expect(port('flow.for_each', 'collect').live).toBe(true);
    expect(kind('flow.for_each').outputs.map((each) => [each.name, each.optional])).toEqual([
      ['results', true],
    ]);
    expect(kind('flow.for_each').scopes).toEqual({ required: ['body'], optional: [] });
  });

  it('exposes item, index from zero, position, first, last and count to the for each body', () => {
    expect(FLOW_SCOPE_OUTPUTS['flow.for_each']?.map((each) => each.name)).toEqual([
      'item',
      'index',
      'position',
      'first',
      'last',
      'count',
    ]);
    expect(FLOW_SCOPE_OUTPUTS['flow.for_each']?.[1]?.type).toEqual({
      t: 'number',
      integer: true,
      min: 0,
    });
    expect(FLOW_SCOPE_OUTPUTS['flow.repeat']?.map((each) => each.name)).toEqual([
      'index',
      'position',
      'first',
      'last',
      'count',
    ]);
    expect(FLOW_SCOPE_OUTPUTS['flow.for_range']?.map((each) => each.name)).toEqual([
      'value',
      'index',
      'position',
    ]);
    expect(FLOW_SCOPE_OUTPUTS['flow.while']?.map((each) => each.name)).toEqual([
      'index',
      'position',
    ]);
    expect(FLOW_SCOPE_OUTPUTS['flow.do_until']?.map((each) => each.name)).toEqual([
      'index',
      'position',
    ]);
    expect(FLOW_SCOPE_OUTPUTS['flow.try']?.map((each) => each.name)).toEqual(['error']);
    expect(FLOW_SCOPE_OUTPUTS['timing.cooldown']?.map((each) => each.name)).toEqual(['remaining']);
  });

  it('gives repeat a count, a static gap and an optional limit with no default', () => {
    expect(inputNames('flow.repeat')).toEqual(['times', 'gap', 'limit']);
    expect(port('flow.repeat', 'times').required).toBe(true);
    expect(port('flow.repeat', 'gap').static).toBe(true);
    expect(port('flow.repeat', 'gap').type).toEqual({ t: 'duration' });
    expect(port('flow.repeat', 'limit').default).toBeUndefined();
    expect(port('flow.repeat', 'limit').required).toBe(false);
  });

  it('gives for range numeric bounds, a default step of one and a value output', () => {
    expect(inputNames('flow.for_range')).toEqual(['from', 'to', 'step']);
    expect(port('flow.for_range', 'step').default).toBe(1);
    expect(port('flow.for_range', 'step').required).toBe(false);
    expect(kind('flow.for_range').scopes).toEqual({ required: ['body'], optional: [] });
  });

  it('gives while and do until a live condition, a gap and no limit unless one is set', () => {
    for (const id of ['flow.while', 'flow.do_until']) {
      expect(inputNames(id)).toEqual(['condition', 'gap', 'limit']);
      expect(port(id, 'condition').live).toBe(true);
      expect(port(id, 'condition').required).toBe(true);
      expect(port(id, 'limit').default).toBeUndefined();
      expect(port(id, 'limit').required).toBe(false);
      expect(port(id, 'limit').description).toContain('Empty means no limit');
      expect(kind(id).scopes).toEqual({ required: ['body'], optional: [] });
    }
  });

  it('describes the limit record with iterations, time, onLimit and note', () => {
    const type = port('flow.while', 'limit').type;
    if (type.t !== 'record') throw new Error('limit is a record');
    expect(Object.keys(type.fields ?? {})).toEqual(['iterations', 'time', 'onLimit', 'note']);
  });

  it('lets break and continue name a loop and take no scopes', () => {
    for (const id of ['flow.break', 'flow.continue']) {
      expect(inputNames(id)).toEqual(['target']);
      expect(port(id, 'target').required).toBe(false);
      expect(kind(id).scopes).toBeUndefined();
      expect(kind(id).exits).toEqual([]);
    }
  });

  it('gives parallel at least two branches, join all first or settled and fail fast or settle', () => {
    expect(kind('flow.parallel').scopes).toEqual({ required: [], optional: [], minimum: 2 });
    expect(choiceIds('flow.parallel', 'join')).toEqual(['all', 'first', 'settled']);
    expect(port('flow.parallel', 'join').default).toBe('all');
    expect(choiceIds('flow.parallel', 'errors')).toEqual(['failFast', 'settle']);
    expect(port('flow.parallel', 'errors').default).toBe('failFast');
    expect(kind('flow.parallel').outputs.map((each) => each.name)).toEqual(['status']);
  });

  it('gives try a required try scope and an optional finally', () => {
    expect(kind('flow.try').scopes).toEqual({ required: ['try'], optional: ['finally'] });
    expect(inputNames('flow.try')).toEqual([]);
  });

  it('gives wait a duration and a run-by-default late policy', () => {
    expect(inputNames('flow.wait')).toEqual(['duration', 'ifLate']);
    expect(port('flow.wait', 'duration').type).toEqual({ t: 'duration' });
    expect(choiceIds('flow.wait', 'ifLate')).toEqual(['run', 'skip', 'fail']);
    expect(port('flow.wait', 'ifLate').default).toBe('run');
  });

  it('gives wait until a skip-by-default late policy with a five minute grace', () => {
    expect(inputNames('flow.wait_until_time')).toEqual(['at', 'clock', 'ifLate', 'grace']);
    expect(port('flow.wait_until_time', 'ifLate').default).toBe('skip');
    expect(choiceIds('flow.wait_until_time', 'ifLate')).toEqual(['skip', 'run']);
    expect(port('flow.wait_until_time', 'grace').default).toBe(WAIT_UNTIL_GRACE_MS);
    expect(WAIT_UNTIL_GRACE_MS).toBe(300_000);
  });

  it('gives wait for event the signal matcher ports, a timeout and a timed out exit', () => {
    expect(inputNames('flow.wait_event')).toEqual([
      'source',
      'kind',
      'subject',
      'field',
      'match',
      'timeout',
    ]);
    expect(kind('flow.wait_event').exits).toEqual(['next', 'timedOut']);
    expect(kind('flow.wait_event').outputs.map((each) => each.name)).toContain('data');
    expect(port('flow.wait_event', 'timeout').static).toBe(true);
  });

  it('gives wait until true a live condition, hold, timeout and a timed out exit', () => {
    expect(inputNames('flow.wait_condition')).toEqual(['condition', 'hold', 'timeout']);
    expect(port('flow.wait_condition', 'condition').live).toBe(true);
    expect(kind('flow.wait_condition').exits).toEqual(['next', 'timedOut']);
  });

  it('gives return an optional exit and stop its message, failed and cancelSelf', () => {
    expect(inputNames('flow.return')).toEqual(['exit']);
    expect(port('flow.return', 'exit').required).toBe(false);
    expect(inputNames('flow.stop')).toEqual(['message', 'failed', 'cancelSelf']);
    expect(port('flow.stop', 'message').required).toBe(false);
    expect(port('flow.stop', 'failed').default).toBe(false);
    expect(port('flow.stop', 'cancelSelf').default).toBe(false);
  });

  it('lets fail raise only catchable classes, defaulting to Failed', () => {
    expect(inputNames('flow.fail')).toEqual(['message', 'class', 'cause']);
    const classes = choiceIds('flow.fail', 'class');
    expect(classes).toContain('Failed');
    expect(classes).toContain('LimitExceeded');
    expect(classes).not.toContain('Cancelled');
    expect(classes).not.toContain('BudgetExceeded');
    expect(port('flow.fail', 'class').default).toBe('Failed');
    expect(port('flow.fail', 'cause').type).toEqual({ t: 'error' });
  });

  it('keeps every summary placeholder on a declared input', () => {
    expect(() => buildRegistry(FLOW_KINDS)).not.toThrow();
  });
});

describe('compileWaitEventMatcher', () => {
  it('builds a signal matcher from the ports', () => {
    const compiled = compileWaitEventMatcher({
      source: 'device',
      kind: 'state_changed',
      subject: 'door',
      field: 'open',
      match: { to: false },
    });
    expect(compiled).toEqual({
      ok: true,
      matcher: {
        source: 'device',
        kind: 'state_changed',
        subject: 'door',
        field: 'open',
        match: { to: false },
      },
    });
  });

  it('leaves out ports that are not set', () => {
    const compiled = compileWaitEventMatcher({ source: 'event', kind: 'doorbell' });
    expect(compiled).toEqual({ ok: true, matcher: { source: 'event', kind: 'doorbell' } });
  });

  it('names what is wrong when the source or kind is missing or blank', () => {
    const compiled = compileWaitEventMatcher({ kind: 'doorbell' });
    expect(compiled.ok).toBe(false);
    if (!compiled.ok) expect(compiled.error).not.toBe('');
    expect(compileWaitEventMatcher({ source: 'event' }).ok).toBe(false);
    expect(compileWaitEventMatcher({ source: 'event', kind: '  ' }).ok).toBe(false);
  });
});

describe('waitUntilTimeError', () => {
  it('accepts a moment alone or a time of day alone', () => {
    expect(waitUntilTimeError({ at: '2026-10-18T07:00:00Z' })).toBeNull();
    expect(waitUntilTimeError({ clock: '07:00' })).toBeNull();
  });

  it('refuses both and neither', () => {
    expect(waitUntilTimeError({ at: '2026-10-18T07:00:00Z', clock: '07:00' })).toContain('both');
    expect(waitUntilTimeError({})).toContain('neither');
  });
});
