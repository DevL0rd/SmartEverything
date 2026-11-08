import { STATIC_KIND_LOOKUP } from '../../src/automation-nodes/kind-lookup';
import { describe, expect, it } from 'vitest';
import { ALL_NODE_KINDS, NODE_REGISTRY } from '../../src/automation-nodes/all-kinds';
import {
  CALL_DEVICE_CHOICES,
  CALL_KINDS,
  CALL_OUTCOME_CHOICES,
} from '../../src/automation-nodes/calls';
import { ERROR_OUT } from '../../src/automation-nodes/error-port';
import { canRouteOnError, fallibleOf } from '../../src/automation-nodes/exec-ports';
import { isOptionSourceId } from '../../src/automation-nodes/option-sources';
import { kindProblems } from '../../src/automation-nodes/registry';
import { modesOf, runModeOf } from '../../src/automation-nodes/run-modes';

const IDS = ['call.person', 'call.open', 'call.end'] as const;

function kindOf(id: (typeof IDS)[number]): NonNullable<ReturnType<typeof NODE_REGISTRY.get>> {
  const found = NODE_REGISTRY.get(id);
  if (found === undefined) throw new Error(`${id} is not registered`);
  return found;
}

describe('call kinds registration', () => {
  it('registers the three kinds once each and valid', () => {
    expect(CALL_KINDS.map((each) => each.id)).toEqual(IDS);
    for (const id of IDS) {
      expect(
        ALL_NODE_KINDS.filter((each) => each.id === id),
        id,
      ).toHaveLength(1);
      expect(kindProblems(kindOf(id)), id).toEqual([]);
      expect(kindOf(id).class).toBe('effect');
    }
  });

  it('has no raw JSON input and only known picker sources', () => {
    for (const id of IDS) {
      for (const port of kindOf(id).inputs) {
        expect(['any', 'record'], `${id} ${port.name}`).not.toContain(port.type.t);
        if (port.ui?.optionsFrom !== undefined)
          expect(isOptionSourceId(port.ui.optionsFrom), `${id} ${port.name}`).toBe(true);
      }
    }
  });
});

describe('call.person', () => {
  const kind = kindOf('call.person');

  it('takes a person, the app to ring, a reason and urgent', () => {
    expect(kind.inputs.map((port) => port.name)).toEqual(['person', 'device', 'reason', 'urgent']);
    expect(kind.inputs[0]).toMatchObject({ type: { t: 'ref', of: 'person' }, required: true });
    expect(kind.inputs[1]).toMatchObject({
      type: { t: 'choice' },
      default: 'any',
      static: true,
      required: false,
    });
    expect(CALL_DEVICE_CHOICES.map((choice) => choice.id)).toEqual(['phone', 'desktop', 'any']);
    expect(kind.inputs[2]).toMatchObject({ type: { t: 'text' }, required: true });
    expect(kind.inputs[3]).toMatchObject({ type: { t: 'boolean' }, default: false });
  });

  it('returns the call id and, when it waited, whether it was answered and how it ended', () => {
    const outputs = Object.fromEntries(kind.outputs.map((port) => [port.name, port]));
    expect(outputs['outreachId']).toMatchObject({ type: { t: 'text' } });
    expect(outputs['outreachId']?.optional).toBeUndefined();
    expect(outputs['answered']).toMatchObject({ type: { t: 'boolean' }, optional: true });
    expect(outputs['outcome']).toMatchObject({ type: { t: 'choice' }, optional: true });
    expect(outputs['timedOut']).toMatchObject({ type: { t: 'boolean' }, optional: true });
    expect(CALL_OUTCOME_CHOICES.map((choice) => choice.id)).toEqual([
      'answered',
      'declined',
      'missed',
      'cancelled',
    ]);
  });

  it('waits for the outcome by default, may send, and routes its failure', () => {
    expect(modesOf(kind)).toEqual({
      default: 'wait_for_result',
      allowed: ['fire_and_forget', 'wait_for_result'],
    });
    expect(runModeOf(kind, undefined)).toBe('wait_for_result');
    expect(runModeOf(kind, 'fire_and_forget')).toBe('fire_and_forget');
    expect(fallibleOf('call.person', STATIC_KIND_LOOKUP)).toBe(true);
    expect(canRouteOnError('call.person', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind.outputs.at(-1)).toBe(ERROR_OUT);
  });

  it('has a timed out exit next to the next exit, optional like the ask exit', () => {
    expect(kind.exits).toEqual(['next', 'timedOut']);
    expect(kind.scopes).toEqual({ required: [], optional: ['timedOut'] });
    expect(kind.scopes).toEqual(NODE_REGISTRY.get('notify.ask')?.scopes);
  });
});

describe('call.open', () => {
  const kind = kindOf('call.open');

  it('takes one camera, doorbell or speaker device or one Talk channel, a reason and urgent', () => {
    expect(kind.inputs.map((port) => port.name)).toEqual(['device', 'channel', 'reason', 'urgent']);
    expect(kind.inputs[0]).toMatchObject({
      type: {
        t: 'optional',
        of: { t: 'ref', of: 'device', families: ['camera', 'doorbell', 'speaker'] },
      },
      required: false,
    });
    expect(kind.inputs[1]).toMatchObject({
      type: { t: 'optional', of: { t: 'text' } },
      ui: { optionsFrom: 'talk.channels' },
    });
  });

  it('returns the call id once the conversation started and routes its failure', () => {
    expect(kind.outputs.map((port) => port.name)).toEqual(['outreachId', 'error']);
    expect(runModeOf(kind, 'fire_and_forget')).toBe('wait_for_result');
    expect(canRouteOnError('call.open', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind.outputs.at(-1)).toBe(ERROR_OUT);
  });
});

describe('call.end', () => {
  const kind = kindOf('call.end');

  it('takes the call id from a wire, not a typed value', () => {
    expect(kind.inputs).toHaveLength(1);
    expect(kind.inputs[0]).toMatchObject({
      name: 'outreachId',
      type: { t: 'text' },
      required: true,
      live: true,
    });
    expect(kind.inputs[0]?.static).toBeUndefined();
  });

  it('confirms and routes its failure', () => {
    expect(kind.outputs.map((port) => port.name)).toEqual(['ok', 'error']);
    expect(canRouteOnError('call.end', STATIC_KIND_LOOKUP)).toBe(true);
    expect(kind.outputs.at(-1)).toBe(ERROR_OUT);
  });
});
