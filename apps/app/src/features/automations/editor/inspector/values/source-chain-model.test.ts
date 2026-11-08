import { describe, expect, it } from 'vitest';
import type { FlowNode, InputPortDecl } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import { automation, uuid } from '../../../model/canvas/canvas-fixtures';
import {
  automationScopeOf,
  chainValuesOf,
  chainedPortOps,
  dependantsOf,
} from './source-chain-model';

function inputsOf(kind: string): readonly InputPortDecl[] {
  const found = NODE_REGISTRY.get(kind);
  if (found === undefined) throw new Error(`no kind ${kind}`);
  return found.inputs;
}

function step(index: number, kind: string, ports: FlowNode['ports']): FlowNode {
  return { id: uuid(index), key: `s${String(index)}`, kind, ports };
}

describe('source chains', () => {
  it('finds the buttons of a remote and every signal level below the source', () => {
    expect(dependantsOf(inputsOf('device.ir_send'), 'remote')).toEqual(['button']);
    expect(dependantsOf(inputsOf('trigger.signal'), 'source')).toEqual([
      'kind',
      'subject',
      'field',
    ]);
    expect(dependantsOf(inputsOf('trigger.signal'), 'kind')).toEqual(['subject', 'field']);
    expect(dependantsOf(inputsOf('trigger.computer'), 'computer')).toEqual(['app']);
    expect(dependantsOf(inputsOf('trigger.signal'), 'field')).toEqual([]);
  });

  it('clears the set dependants when the parent picks something else', () => {
    const node = {
      key: 'ir',
      inputs: inputsOf('device.ir_send'),
      ports: { remote: { lit: 'tv' }, button: { lit: 'power' } },
    };
    expect(chainedPortOps(node, 'remote', { lit: 'fan' })).toEqual([
      { op: 'set', key: 'ir', ports: { remote: { lit: 'fan' } } },
      { op: 'unset', key: 'ir', ports: ['button'] },
    ]);
    expect(chainedPortOps(node, 'remote', null)).toEqual([
      { op: 'unset', key: 'ir', ports: ['remote'] },
      { op: 'unset', key: 'ir', ports: ['button'] },
    ]);
  });

  it('keeps dependants when the parent is set to the same value or none are set', () => {
    const node = {
      key: 'ir',
      inputs: inputsOf('device.ir_send'),
      ports: { remote: { lit: 'tv' }, button: { lit: 'power' } },
    };
    expect(chainedPortOps(node, 'remote', { lit: 'tv' })).toEqual([
      { op: 'set', key: 'ir', ports: { remote: { lit: 'tv' } } },
    ]);
    expect(chainedPortOps({ ...node, ports: {} }, 'remote', { lit: 'fan' })).toEqual([
      { op: 'set', key: 'ir', ports: { remote: { lit: 'fan' } } },
    ]);
  });

  it('feeds only literal port values to the resolver', () => {
    expect(
      chainValuesOf({ remote: { lit: 'tv' }, button: { wire: { from: 'trigger', port: 'x' } } }),
    ).toEqual({ remote: 'tv' });
  });

  it('lists this automation’s triggers, variables and timers and events sent anywhere', () => {
    const program = automation(
      [
        step(1, 'state.timer', { name: { lit: 'laundry' } }),
        step(2, 'state.timer', { name: { lit: 'laundry' } }),
        step(3, 'signal.emit', { name: { lit: 'guests_arrived' } }),
      ],
      {
        variables: [{ name: 'count', type: { t: 'number' }, initial: { lit: 0 } }],
      },
    );
    const other = automation([step(4, 'signal.emit', { name: { lit: 'night_mode' } })]);
    const scope = automationScopeOf(program, NODE_REGISTRY, [other]);
    expect(scope.triggers.map((row) => row.id)).toEqual(['t0']);
    expect(scope.triggers[0]?.label).toBe(NODE_REGISTRY.get('trigger.time')?.name);
    expect(scope.variables).toEqual([{ id: 'count', label: 'count' }]);
    expect(scope.timers).toEqual([{ id: 'laundry', label: 'laundry' }]);
    expect(scope.events.map((row) => row.id)).toEqual(['guests_arrived', 'night_mode']);
  });
});
