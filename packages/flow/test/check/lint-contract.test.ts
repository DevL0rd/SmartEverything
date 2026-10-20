import { describe, expect, it } from 'vitest';
import { call } from '../functions/support';
import { automation, wired, functionProgram, lit, node, trigger } from './c23-support';
import { findings, keysOf, only } from './lint-support';

const WHO = { name: 'who', type: { t: 'text' } as const, required: true };

describe('lint of a reusable node', () => {
  it('rejects a trigger, stateful steps and a read step', () => {
    const program = functionProgram(
      [
        node('t', 'trigger.time', { at: lit('07:00') }),
        node('cool', 'timing.cooldown', {}),
        node('starter', 'automation.run', {}),
        node('look', 'device.get', {}),
        node('plain', 'notify.feed', { message: lit('hi') }),
      ],
      { flavour: 'pure' },
    );
    const found = findings(program);
    expect(keysOf(found, 'trigger_in_reusable')).toEqual(['t']);
    expect(keysOf(found, 'stateful_in_reusable')).toEqual(['cool', 'starter']);
    expect(keysOf(found, 'read_in_function')).toEqual(['look']);
    expect(only(found, 'trigger_in_reusable')[0]?.severity).toBe('error');
  });

  it('lets an action read but not keep memory', () => {
    const found = findings(
      functionProgram([node('look', 'device.get', {})], { flavour: 'action' }),
    );
    expect(only(found, 'read_in_function')).toEqual([]);
  });

  it('rejects kept data in a calculation Custom Node', () => {
    const found = findings(
      functionProgram([], {
        flavour: 'pure',
        variables: [
          { name: 'kept', type: { t: 'number' }, initial: lit(0), persist: true },
          { name: 'temp', type: { t: 'number' }, initial: lit(0) },
        ],
      }),
    );
    const hits = only(found, 'kept_data_in_function');
    expect(hits.map((item) => item.port)).toEqual(['variables.kept']);
  });

  it('lets an action Custom Node keep data between runs', () => {
    const found = findings(
      functionProgram([], {
        variables: [{ name: 'kept', type: { t: 'number' }, initial: lit(0), persist: true }],
      }),
    );
    expect(only(found, 'kept_data_in_function')).toEqual([]);
  });

  it('does not apply reusable rules to an automation', () => {
    const found = findings(
      automation([node('cool', 'timing.cooldown', {})], {
        variables: [{ name: 'kept', type: { t: 'number' }, initial: lit(0), persist: true }],
      }),
    );
    expect(only(found, 'stateful_in_reusable')).toEqual([]);
    expect(only(found, 'kept_data_in_function')).toEqual([]);
  });
});

describe('lint of inputs', () => {
  it('asks for a default on a required input of a triggered automation', () => {
    const triggered = automation([], {
      triggers: [trigger('t', 'trigger.time', { at: lit('07:00') })],
      inputs: [
        WHO,
        { name: 'ok', type: { t: 'text' }, required: true, default: 'x' },
        { name: 'loose', type: { t: 'text' }, required: false },
      ],
    });
    const hits = only(findings(triggered), 'input_needs_default');
    expect(hits.map((item) => item.port)).toEqual(['inputs.who']);
  });

  it('leaves untriggered automations and functions alone', () => {
    expect(only(findings(automation([], { inputs: [WHO] })), 'input_needs_default')).toEqual([]);
    expect(only(findings(functionProgram([], { inputs: [WHO] })), 'input_needs_default')).toEqual(
      [],
    );
  });
});

describe('lint of recursion', () => {
  const codes = (program: Parameters<typeof findings>[0]): readonly string[] =>
    findings(program).map((found) => found.code);

  it('treats a Custom Node that calls itself like any other call', () => {
    const self = functionProgram([call('again', 'f1')]);
    const other = functionProgram([call('again', 'f2')]);
    expect(codes(self)).toEqual(codes(other));
  });

  it('treats a long chain of calls like a single call', () => {
    const long = automation([call('start', 'f0'), call('next', 'f1'), call('last', 'f19')]);
    const short = automation([call('start', 'f0')]);
    expect(new Set(codes(long))).toEqual(new Set(codes(short)));
  });
});

describe('lint of exits', () => {
  const exits = ['done', 'failed'];

  it('warns about an exit no Return leaves by', () => {
    const program = functionProgram([node('r', 'flow.return', { exit: lit('done') })], { exits });
    expect(only(findings(program), 'unreachable_exit').map((item) => item.port)).toEqual([
      'exits.failed',
    ]);
  });

  it('counts the first exit as reached by falling off the end or a bare Return', () => {
    const program = functionProgram(
      [node('r', 'flow.return', {}), node('s', 'flow.return', { exit: lit('failed') })],
      {
        exits,
      },
    );
    expect(only(findings(program), 'unreachable_exit')).toEqual([]);
  });

  it('stays quiet when an exit is chosen by a wire', () => {
    const program = functionProgram([node('r', 'flow.return', { exit: wired('inputs.exit') })], {
      exits,
    });
    expect(only(findings(program), 'unreachable_exit')).toEqual([]);
  });

  it('does not apply to functions, automations or a body without Return', () => {
    expect(
      only(findings(functionProgram([], { exits, flavour: 'pure' })), 'unreachable_exit'),
    ).toEqual([]);
    expect(only(findings(automation([])), 'unreachable_exit')).toEqual([]);
    expect(only(findings(functionProgram([], { exits })), 'unreachable_exit')).toHaveLength(1);
  });
});

describe('lint of unit conversion', () => {
  it('rejects units of different kinds and accepts matching ones', () => {
    const found = findings(
      automation([
        node('bad', 'math.convert_unit', { from: lit('c'), to: lit('km'), value: lit(1) }),
        node('good', 'math.convert_unit', { from: lit('c'), to: lit('f'), value: lit(1) }),
      ]),
    );
    expect(keysOf(found, 'unit_mismatch')).toEqual(['bad']);
    expect(only(found, 'unit_mismatch')[0]?.severity).toBe('error');
  });
});
