import { describe, expect, it } from 'vitest';
import type { FlowNode } from '@smarteverything/domain';
import { CATCHABLE_ERROR_CLASS } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { Ids, automation, scope, setLight } from '../../../model/canvas/canvas-fixtures';
import {
  CATCH_CLASSES,
  failAgainChoice,
  failAgainOps,
  failAgainPorts,
  toggledClass,
} from './catch-model';
import { applied } from './inspector-fixtures';

describe('failure kinds', () => {
  it('offers exactly the kinds a catch can handle', () => {
    expect(CATCH_CLASSES.map((entry) => entry.value).toSorted()).toEqual(
      [...CATCHABLE_ERROR_CLASS.options].toSorted(),
    );
  });

  it('toggles a kind on and off', () => {
    expect(toggledClass([], 'Timeout')).toEqual(['Timeout']);
    expect(toggledClass(['Timeout', 'Failed'], 'Timeout')).toEqual(['Failed']);
  });
});

describe('Fail again', () => {
  const ids = new Ids();
  const caught = ids.next().id;
  const tryNode: FlowNode = {
    ...ids.next(),
    kind: 'flow.try',
    scopes: { try: scope([setLight(ids, null)]) },
    catches: [{ id: caught, scope: scope([]) }],
  };
  const program = automation([tryNode]);

  it('adds a Fail again step inside the catch row that reads the caught failure', () => {
    const next = applied(program, failAgainOps(tryNode.key, caught, 'same'));
    const added = indexProgram(next).nodes.find((entry) => entry.node.kind === 'flow.fail');
    expect(added?.node.ports).toEqual({ cause: { wire: { from: tryNode.key, port: 'error' } } });
    expect(added?.scope).toMatchObject({ t: 'child', key: tryNode.key });
  });

  it('can start with a new message and keep the caught failure as the cause', () => {
    const next = applied(program, failAgainOps(tryNode.key, caught, 'new'));
    const added = indexProgram(next).nodes.find((entry) => entry.node.kind === 'flow.fail');
    expect(added?.node.ports?.['message']).toEqual({ lit: '' });
    expect(added?.node.ports?.['cause']).toEqual({ wire: { from: tryNode.key, port: 'error' } });
  });

  it('recognises which choice a Fail again step is on', () => {
    const same = applied(program, failAgainOps(tryNode.key, caught, 'same'));
    const entry = indexProgram(same).nodes.find((found) => found.node.kind === 'flow.fail');
    expect(entry === undefined ? null : failAgainChoice(entry.node)).toEqual({
      source: tryNode.key,
      mode: 'same',
    });
    const fresh = applied(program, failAgainOps(tryNode.key, caught, 'new'));
    const other = indexProgram(fresh).nodes.find((found) => found.node.kind === 'flow.fail');
    expect(other === undefined ? null : failAgainChoice(other.node)).toMatchObject({ mode: 'new' });
  });

  it('is not offered on other steps or on a failure with a plain cause', () => {
    expect(failAgainChoice(tryNode)).toBeNull();
    const plain: FlowNode = { ...ids.next(), kind: 'flow.fail', ports: { message: { lit: 'x' } } };
    expect(failAgainChoice(plain)).toBeNull();
    const odd: FlowNode = { ...plain, ports: { cause: { wire: { from: 'a', port: 'value' } } } };
    expect(failAgainChoice(odd)).toBeNull();
  });

  it('gives the ports each choice writes', () => {
    const cause = { wire: { from: 't', port: 'error' } };
    expect(failAgainPorts('t', 'same')).toEqual({ cause });
    expect(failAgainPorts('t', 'new')).toEqual({ message: { lit: '' }, cause });
  });
});
