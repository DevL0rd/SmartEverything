import { describe, expect, it } from 'vitest';
import { FUNCTION_V3, type FunctionV3 } from '@smarteverything/domain';
import { applyInterfaceEdit, returnsUsing } from './interface-model';
import {
  blankDraft,
  draftOfInput,
  identOf,
  inputOf,
  outputOf,
  typeOptions,
} from './row-draft-model';
import { impactOf } from './impact-model';
import { emptyFunction, newNodeRequest, nameIssue } from './new-node-model';
import { followOps, instanceState, pinOps, revisionChoices } from './instance-model';

let counter = 0;
const newId = (): string => {
  counter += 1;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
};

function program(): FunctionV3 {
  return FUNCTION_V3.parse({
    version: 3,
    kind: 'function',
    flavour: 'action',
    inputs: [
      { name: 'lights', type: { t: 'any' }, required: true },
      { name: 'step', type: { t: 'number' }, required: false, default: 25 },
    ],
    outputs: [{ name: 'level', type: { t: 'number' } }],
    exits: ['done', 'dark'],
    variables: [],
    body: {
      nodes: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          key: 'ret_dark',
          kind: 'flow.return',
          ports: { exit: { lit: 'dark' } },
        },
        { id: '22222222-2222-4222-8222-222222222222', key: 'ret_done', kind: 'flow.return' },
      ],
    },
  });
}

describe('interface edits', () => {
  it('adds, updates and removes inputs and outputs', () => {
    const added = applyInterfaceEdit(program(), {
      op: 'put-input',
      port: { name: 'speed', type: { t: 'number' }, required: false },
    });
    expect(added.ok && added.program.inputs.map((port) => port.name)).toEqual([
      'lights',
      'step',
      'speed',
    ]);
    const updated = applyInterfaceEdit(program(), {
      op: 'put-output',
      port: { name: 'level', type: { t: 'text' } },
    });
    expect(updated.ok && updated.program.outputs[0]?.type).toEqual({ t: 'text' });
    const removed = applyInterfaceEdit(program(), {
      op: 'remove-port',
      side: 'inputs',
      name: 'step',
    });
    expect(removed.ok && removed.program.inputs).toHaveLength(1);
    expect(
      applyInterfaceEdit(program(), { op: 'remove-port', side: 'outputs', name: 'x' }).ok,
    ).toBe(false);
  });

  it('reorders only with a full permutation', () => {
    const good = applyInterfaceEdit(program(), {
      op: 'reorder',
      side: 'inputs',
      order: ['step', 'lights'],
    });
    expect(good.ok && good.program.inputs.map((port) => port.name)).toEqual(['step', 'lights']);
    const bad = applyInterfaceEdit(program(), { op: 'reorder', side: 'exits', order: ['done'] });
    expect(bad).toMatchObject({ ok: false, reason: 'bad-order' });
  });

  it('asks where Return steps go before removing an exit they use', () => {
    expect(returnsUsing(program(), 'dark')).toEqual(['ret_dark']);
    expect(returnsUsing(program(), 'done')).toEqual(['ret_done']);
    const asked = applyInterfaceEdit(program(), { op: 'remove-exit', name: 'dark' });
    expect(asked).toMatchObject({ ok: false, reason: 'needs-route', returns: ['ret_dark'] });
    const routed = applyInterfaceEdit(program(), {
      op: 'remove-exit',
      name: 'dark',
      routeTo: 'done',
    });
    expect(routed.ok && routed.program.exits).toEqual(['done']);
    expect(routed.ok && returnsUsing(routed.program, 'done')).toEqual(['ret_dark', 'ret_done']);
  });

  it('keeps at least one exit and refuses duplicates', () => {
    const single = { ...program(), exits: ['done'] };
    expect(applyInterfaceEdit(single, { op: 'remove-exit', name: 'done' })).toMatchObject({
      reason: 'last-exit',
    });
    expect(applyInterfaceEdit(program(), { op: 'add-exit', name: 'dark' })).toMatchObject({
      reason: 'duplicate',
    });
    const added = applyInterfaceEdit(program(), { op: 'add-exit', name: 'late' });
    expect(added.ok && added.program.exits).toEqual(['done', 'dark', 'late']);
  });
});

describe('row drafts', () => {
  it('derives a unique valid key from the label', () => {
    expect(identOf('Brightness step', [])).toBe('brightness_step');
    expect(identOf('Brightness step', ['brightness_step'])).toBe('brightness_step_2');
    expect(identOf('9 lives', [])).toBe('v_9_lives');
    expect(identOf('!!!', [])).toBe('value');
  });

  it('builds an input with a typed default', () => {
    const draft = {
      ...blankDraft(),
      label: 'Step size',
      type: 'number' as const,
      presence: 'default' as const,
      defaultText: '25',
    };
    expect(inputOf(draft, ['lights'])).toEqual({
      ok: true,
      port: {
        name: 'step_size',
        label: 'Step size',
        type: { t: 'number' },
        required: false,
        default: 25,
      },
    });
    const bad = inputOf({ ...draft, defaultText: 'abc' }, []);
    expect(bad.ok).toBe(false);
    expect(inputOf({ ...draft, label: ' ' }, []).ok).toBe(false);
  });

  it('keeps the key of an existing row and its unusual type', () => {
    const draft = draftOfInput({
      name: 'rooms',
      type: { t: 'list', of: { t: 'text' } },
      required: true,
    });
    expect(draft).toMatchObject({ key: 'rooms', type: 'keep', presence: 'required' });
    expect(typeOptions(draft)[0]).toEqual({ value: 'keep', label: 'List of text' });
    const result = inputOf({ ...draft, label: 'Rooms' }, ['rooms']);
    expect(result.ok && result.port.type).toEqual({ t: 'list', of: { t: 'text' } });
  });

  it('marks optional outputs', () => {
    const result = outputOf({ ...blankDraft(), label: 'Level', presence: 'optional' }, []);
    expect(result.ok && result.port).toEqual({
      name: 'level',
      label: 'Level',
      type: { t: 'text' },
      optional: true,
    });
  });
});

describe('impact label', () => {
  const before = program();
  const users = [
    { kind: 'automation' as const, id: 'a', name: 'Night' },
    { kind: 'function' as const, id: 'b', name: 'Wrap' },
  ];

  it('is compatible for an added optional input and counts callers', () => {
    const next = applyInterfaceEdit(before, {
      op: 'put-input',
      port: { name: 'speed', type: { t: 'number' }, required: false },
    });
    if (!next.ok) throw new Error('edit failed');
    expect(impactOf(before, next.program, users)).toMatchObject({
      tone: 'compatible',
      chip: 'Compatible',
      message: 'This change updates 1 automation and 1 Custom Node.',
    });
  });

  it('is breaking when an input is removed and says what to do', () => {
    const next = applyInterfaceEdit(before, { op: 'remove-port', side: 'inputs', name: 'lights' });
    if (!next.ok) throw new Error('edit failed');
    const impact = impactOf(before, next.program, users);
    expect(impact.tone).toBe('breaking');
    expect(impact.message).toContain('Input lights was removed.');
    expect(impact.message).toContain('when you publish');
  });

  it('says nothing changed for the same interface', () => {
    expect(impactOf(before, before, users).tone).toBe('unchanged');
  });
});

describe('new node and instance helpers', () => {
  it('starts with one Return step that leaves through done', () => {
    const value = emptyFunction('value', newId);
    expect(value.flavour).toBe('pure');
    expect(value.exits).toEqual(['done']);
    expect(value.body.nodes[0]?.kind).toBe('flow.return');
    expect(newNodeRequest(' Fade ', 'step', newId).definition.flavour).toBe('action');
    expect(nameIssue(' ')).not.toBeNull();
    expect(nameIssue('x'.repeat(200))).not.toBeNull();
    expect(nameIssue('Fade')).toBeNull();
  });

  it('reads follow and pin state and builds the ops', () => {
    const base = { id: 'n', key: 'call', kind: 'fn.call', ports: { fn: { lit: 'f' } } };
    expect(instanceState(base, 5)).toMatchObject({ mode: 'follow', behind: false, locked: false });
    const pinned = instanceState({ ...base, ports: { ...base.ports, pin: { lit: 3 } } }, 5);
    expect(pinned).toMatchObject({ mode: 'pin', pinned: 3, behind: true });
    expect(instanceState({ ...base, pin: { revision: 2 } }, 5).locked).toBe(true);
    expect(pinOps('call', 3)).toEqual([{ op: 'set', key: 'call', ports: { pin: { lit: 3 } } }]);
    expect(followOps('call')).toEqual([{ op: 'unset', key: 'call', ports: ['pin'] }]);
    expect(revisionChoices(3).map((choice) => choice.value)).toEqual(['3', '2', '1']);
  });
});
