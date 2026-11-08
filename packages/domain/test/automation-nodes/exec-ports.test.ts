import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import type { GraphNode } from '../../src/automation-v3/graph';
import {
  canRouteOnError,
  execClassOf,
  execPortsOf,
  fallibleOf,
  isErrorExitWired,
  isExecNode,
} from '../../src/automation-nodes/exec-ports';
import { ALL_NODE_KINDS } from '../../src/automation-nodes/all-kinds';
import { ERROR_EXIT_OUTPUTS } from '../../src/automation-nodes/error-port';

const id = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function node(kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id: id(1), key: 'subject', kind, ...extra };
}

function shape(kind: string, graphNode?: GraphNode): readonly string[] {
  return execPortsOf(kind, graphNode, STATIC_KIND_LOOKUP).outputs.map(
    (out) => `${out.port}|${out.role}|${out.label}`,
  );
}

describe('exec ports per kind group', () => {
  it('Start has no input and one Then; On failure the same', () => {
    expect(execPortsOf('flow.start', undefined, STATIC_KIND_LOOKUP).input).toBe(false);
    expect(shape('flow.start')).toEqual(['next|next|Then']);
    expect(execPortsOf('flow.on_failure', undefined, STATIC_KIND_LOOKUP).input).toBe(false);
    expect(shape('flow.on_failure')).toEqual(['next|next|Then']);
    expect(execClassOf('flow.start', STATIC_KIND_LOOKUP)).toBe('start');
    expect(execClassOf('flow.on_failure', STATIC_KIND_LOOKUP)).toBe('failure');
  });

  it('triggers and values have no exec ports', () => {
    for (const kind of ['trigger.time', 'logic.between', 'device.get', 'var.get']) {
      expect(execClassOf(kind, STATIC_KIND_LOOKUP)).toBe('value');
      expect(isExecNode(kind, STATIC_KIND_LOOKUP)).toBe(false);
      expect(execPortsOf(kind, undefined, STATIC_KIND_LOOKUP)).toEqual({
        input: false,
        outputs: [],
      });
    }
  });

  it('steps have an input and Then, and a lane for the error only when routed', () => {
    for (const kind of [
      'device.set',
      'var.set',
      'var.change',
      'fn.call',
      'debug.log',
      'http.request',
    ]) {
      expect(execClassOf(kind, STATIC_KIND_LOOKUP)).toBe('step');
      expect(execPortsOf(kind, undefined, STATIC_KIND_LOOKUP).input).toBe(true);
      expect(shape(kind)).toEqual(['next|next|Then']);
    }
    const routed = node('device.set', { policy: { onError: 'route' } });
    expect(shape('device.set', routed)).toEqual(['next|next|Then', 'onError|lane|If it fails']);
    const failing = node('device.set', { policy: { onError: 'fail' } });
    expect(shape('device.set', failing)).toEqual(['next|next|Then']);
  });

  it('at-step reads are steps, lazy reads are values', () => {
    expect(execClassOf('device.snapshot', STATIC_KIND_LOOKUP)).toBe('step');
    expect(shape('device.snapshot')).toEqual(['next|next|Then']);
    expect(execClassOf('device.get', STATIC_KIND_LOOKUP)).toBe('value');
  });

  it('plain waits are steps with Then only', () => {
    expect(shape('flow.wait')).toEqual(['next|next|Then']);
    expect(shape('flow.wait_until_time')).toEqual(['next|next|Then']);
  });

  it('waits with a timeout show the Timed out lane only when a timeout is set', () => {
    for (const kind of ['flow.wait_event', 'flow.wait_condition', 'notify.ask']) {
      expect(shape(kind, node(kind))).toEqual(['next|next|Then']);
      const timed = node(kind, { ports: { timeout: { lit: 60000 } } });
      expect(shape(kind, timed)).toEqual(['next|next|Then', 'timedOut|lane|Timed out']);
    }
  });

  it('memory nodes with exits keep the first as Then and the others as branches', () => {
    expect(shape('timing.cooldown')).toEqual(['next|next|Then', 'blocked|branch|Blocked']);
    expect(shape('timing.debounce')).toEqual(['next|next|Then', 'superseded|branch|Superseded']);
    expect(shape('timing.rate_limit')).toEqual(['next|next|Then', 'dropped|branch|Dropped']);
    expect(shape('timing.quiet_hours')).toEqual(['next|next|Then', 'held|branch|Held']);
    expect(execClassOf('timing.cooldown', STATIC_KIND_LOOKUP)).toBe('decision');
    expect(shape('state.counter')).toEqual(['next|next|Then']);
    expect(execClassOf('state.counter', STATIC_KIND_LOOKUP)).toBe('step');
  });

  it('If has one branch per row and Otherwise', () => {
    const row = (n: number, to?: string): NonNullable<GraphNode['branches']>[number] => ({
      id: id(n),
      when: { lit: true },
      ...(to === undefined ? {} : { to }),
    });
    const two = node('flow.if', { branches: [row(10, 'a'), row(11)], to: { else: 'b' } });
    expect(shape('flow.if', two)).toEqual([
      `row:${id(10)}|branch|If`,
      `row:${id(11)}|branch|Else if`,
      'else|branch|Otherwise',
    ]);
    const outputs = execPortsOf('flow.if', two, STATIC_KIND_LOOKUP).outputs;
    expect(outputs.map((out) => out.target)).toEqual(['a', undefined, 'b']);
    expect(outputs[0]?.handle).toBe(`x:row:${id(10)}`);
    expect(execClassOf('flow.if', STATIC_KIND_LOOKUP)).toBe('decision');
  });

  it('Switch has one branch per case and Default', () => {
    const cases = [
      { id: id(20), match: { eq: 'cold' }, to: 'heat' },
      { id: id(21), match: { in: ['a', 'b'] } },
      { id: id(22), match: { range: { min: 1 } } },
      { id: id(23), match: { when: { lit: true } } },
    ];
    const pick = node('flow.switch', { cases, to: { default: 'rest' } });
    expect(shape('flow.switch', pick)).toEqual([
      `case:${id(20)}|branch|Is cold`,
      `case:${id(21)}|branch|Is one of 2`,
      `case:${id(22)}|branch|In a range`,
      `case:${id(23)}|branch|When true`,
      'default|branch|Default',
    ]);
    expect(execPortsOf('flow.switch', pick, STATIC_KIND_LOOKUP).outputs[0]?.target).toBe('heat');
  });

  it('Only continue if has Then and Otherwise', () => {
    expect(shape('flow.guard')).toEqual(['next|next|Then', 'otherwise|branch|Otherwise']);
    const wired = node('flow.guard', { to: { next: 'a', otherwise: 'b' } });
    expect(
      execPortsOf('flow.guard', wired, STATIC_KIND_LOOKUP).outputs.map((out) => out.target),
    ).toEqual(['a', 'b']);
  });

  it('every loop has a body lane and When done', () => {
    for (const kind of [
      'flow.repeat',
      'flow.for_range',
      'flow.while',
      'flow.do_until',
      'flow.forever',
    ]) {
      expect(execClassOf(kind, STATIC_KIND_LOOKUP)).toBe('owner');
      expect(shape(kind)).toEqual(['body|lane|Each pass', 'next|next|When done']);
    }
    expect(shape('flow.for_each')).toEqual(['body|lane|Each item', 'next|next|When done']);
  });

  it('Try has the Try lane, catch lanes, Finally and Then', () => {
    const attempt = node('flow.try', {
      catches: [{ id: id(30) }, { id: id(31), classes: ['Unreachable', 'Timeout'] }],
    });
    expect(shape('flow.try', attempt)).toEqual([
      'try|lane|Try',
      `catch:${id(30)}|lane|If it fails`,
      `catch:${id(31)}|lane|On Unreachable or Timeout`,
      'finally|lane|Finally',
      'next|next|Then',
    ]);
    expect(execClassOf('flow.try', STATIC_KIND_LOOKUP)).toBe('owner');
  });

  it('Set temporarily has a While lane and Then', () => {
    expect(shape('device.set_temporarily')).toEqual(['body|lane|While', 'next|next|Then']);
    expect(execClassOf('device.set_temporarily', STATIC_KIND_LOOKUP)).toBe('owner');
  });

  it('Do together has one lane per path and no Then', () => {
    const fork = node('flow.parallel', {
      paths: [{ name: 'left', to: 'meet' }, { name: 'right' }],
    });
    expect(shape('flow.parallel', fork)).toEqual(['path:left|lane|left', 'path:right|lane|right']);
    expect(execPortsOf('flow.parallel', fork, STATIC_KIND_LOOKUP).input).toBe(true);
    expect(execClassOf('flow.parallel', STATIC_KIND_LOOKUP)).toBe('fork');
  });

  it('Wait for all has many wires in and Then out', () => {
    expect(execPortsOf('flow.join', undefined, STATIC_KIND_LOOKUP).input).toBe(true);
    expect(shape('flow.join')).toEqual(['next|next|Then']);
    expect(execClassOf('flow.join', STATIC_KIND_LOOKUP)).toBe('join');
  });

  it('terminals have an input and no outputs', () => {
    for (const kind of ['flow.stop', 'flow.return', 'flow.fail', 'flow.break', 'flow.continue']) {
      expect(execClassOf(kind, STATIC_KIND_LOOKUP)).toBe('terminal');
      expect(execPortsOf(kind, undefined, STATIC_KIND_LOOKUP)).toEqual({
        input: true,
        outputs: [],
      });
    }
  });

  it('lets only plain steps route their errors', () => {
    expect(canRouteOnError('device.set', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('flow.wait_event', STATIC_KIND_LOOKUP)).toBe(true);
    for (const kind of [
      'flow.if',
      'flow.switch',
      'flow.guard',
      'flow.for_each',
      'flow.try',
      'flow.parallel',
      'flow.join',
      'flow.stop',
      'device.get',
    ]) {
      expect(canRouteOnError(kind, STATIC_KIND_LOOKUP), kind).toBe(false);
    }
  });

  it('treats an unknown kind as having no exec ports', () => {
    expect(execClassOf('nothing.here', STATIC_KIND_LOOKUP)).toBe('value');
    expect(execPortsOf('nothing.here', undefined, STATIC_KIND_LOOKUP)).toEqual({
      input: false,
      outputs: [],
    });
  });
});

describe('the If it fails exit', () => {
  it('marks effects and timed waits fallible and pure effects not', () => {
    for (const kind of [
      'device.set',
      'device.ir_send',
      'tool.call',
      'http.request',
      'ai.ask',
      'computer.power',
      'phone.action',
      'notify.ask',
      'flow.wait_event',
      'flow.wait_condition',
    ]) {
      expect(fallibleOf(kind, STATIC_KIND_LOOKUP), kind).toBe(true);
      expect(canRouteOnError(kind, STATIC_KIND_LOOKUP), kind).toBe(true);
    }
    for (const kind of [
      'debug.log',
      'debug.breakpoint',
      'flow.wait',
      'device.get',
      'signal.emit',
      'var.set',
      'var.change',
    ]) {
      expect(fallibleOf(kind, STATIC_KIND_LOOKUP), kind).toBe(false);
      expect(canRouteOnError(kind, STATIC_KIND_LOOKUP), kind).toBe(false);
    }
    expect(fallibleOf('nothing.here', STATIC_KIND_LOOKUP)).toBe(false);
  });

  it('shows the exit when wired even without the route policy, carrying the error value', () => {
    const wired = node('device.set', { to: { onError: 'recover' } });
    expect(isErrorExitWired(wired)).toBe(true);
    expect(shape('device.set', wired)).toEqual(['next|next|Then', 'onError|lane|If it fails']);
    const exit = execPortsOf('device.set', wired, STATIC_KIND_LOOKUP).outputs[1];
    expect(exit?.target).toBe('recover');
    expect(exit?.carries).toBe(ERROR_EXIT_OUTPUTS);
    expect(ERROR_EXIT_OUTPUTS.map((out) => out.name)).toEqual(['reason', 'message', 'code']);
  });

  it('leaves the exec ports of every kind unchanged while the exit is not wired or routed', () => {
    for (const kind of ALL_NODE_KINDS) {
      const plain = execPortsOf(kind.id, node(kind.id), STATIC_KIND_LOOKUP);
      expect(
        plain.outputs.some((out) => out.port === 'onError'),
        kind.id,
      ).toBe(false);
      expect(
        plain.outputs.some((out) => out.carries !== undefined),
        kind.id,
      ).toBe(false);
    }
  });
});
