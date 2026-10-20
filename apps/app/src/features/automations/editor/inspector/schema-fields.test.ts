import { describe, expect, it } from 'vitest';
import type { FlowType, InputPortDecl } from '@smarteverything/domain';
import { NODE_REGISTRY } from '@smarteverything/domain';
import {
  conforms,
  controlOf,
  fieldOf,
  fieldsOf,
  formFields,
  formKind,
  formOps,
  formSchema,
  formValues,
} from './schema-fields';

function declared(kindId: string, port: string): InputPortDecl {
  const decl = NODE_REGISTRY.get(kindId)?.inputs.find((input) => input.name === port);
  if (decl === undefined) throw new Error(`${kindId} has no port ${port}`);
  return decl;
}

describe('controlOf', () => {
  it('picks one control for every scalar type', () => {
    const expected: readonly [FlowType, string][] = [
      [{ t: 'boolean' }, 'switch'],
      [{ t: 'duration' }, 'duration'],
      [{ t: 'instant' }, 'moment'],
      [{ t: 'timeOfDay' }, 'moment'],
      [{ t: 'date' }, 'moment'],
      [{ t: 'color' }, 'colour'],
      [{ t: 'error' }, 'wire'],
      [{ t: 'any' }, 'json'],
      [{ t: 'param', name: 'item' }, 'json'],
      [{ t: 'text' }, 'text'],
    ];
    for (const [type, control] of expected) expect(controlOf(type).t).toBe(control);
  });

  it('keeps the date kind of a moment control', () => {
    expect(controlOf({ t: 'date' })).toEqual({ t: 'moment', of: 'date' });
    expect(controlOf({ t: 'timeOfDay' })).toEqual({ t: 'moment', of: 'timeOfDay' });
  });

  it('reads the bounds of a number and lets the port hint win', () => {
    const type: FlowType = { t: 'number', integer: true, min: 1, max: 9, unit: 'x' };
    expect(controlOf(type)).toEqual({
      t: 'number',
      integer: true,
      min: 1,
      max: 9,
      step: 1,
      unit: 'x',
    });
    expect(controlOf(type, { min: 2, max: 5, step: 5, unit: 'ms' })).toEqual({
      t: 'number',
      integer: true,
      min: 2,
      max: 5,
      step: 5,
      unit: 'ms',
    });
  });

  it('gives a text port a plain text control', () => {
    expect(controlOf({ t: 'text' })).toEqual({ t: 'text' });
  });

  it('lists the options of a choice and lets the port options win', () => {
    const type: FlowType = { t: 'choice', options: [{ id: 'a', label: 'A' }] };
    expect(controlOf(type)).toEqual({ t: 'choice', options: [{ id: 'a', label: 'A' }] });
    expect(controlOf(type, { options: [{ id: 'b', label: 'B' }] })).toEqual({
      t: 'choice',
      options: [{ id: 'b', label: 'B' }],
    });
  });

  it('carries the reference kind and the capabilities it is narrowed to', () => {
    expect(controlOf({ t: 'ref', of: 'device', capabilities: ['power'] })).toEqual({
      t: 'reference',
      of: 'device',
      capabilities: ['power'],
    });
    expect(controlOf({ t: 'ref', of: 'room' })).toEqual({
      t: 'reference',
      of: 'room',
      capabilities: [],
    });
  });

  it('looks through an optional and into a list', () => {
    expect(controlOf({ t: 'optional', of: { t: 'boolean' } }).t).toBe('switch');
    expect(controlOf({ t: 'list', of: { t: 'text' } })).toEqual({
      t: 'list',
      item: { t: 'text' },
    });
  });

  it('describes record fields and treats an open record as json', () => {
    const control = controlOf({
      t: 'record',
      fields: { gap: { t: 'optional', of: { t: 'duration' } }, onLimit: { t: 'boolean' } },
    });
    expect(control).toEqual({
      t: 'record',
      fields: [
        { name: 'gap', title: 'Gap', control: { t: 'duration' }, optional: true },
        { name: 'onLimit', title: 'On limit', control: { t: 'switch' }, optional: false },
      ],
    });
    expect(controlOf({ t: 'record', values: { t: 'text' } })).toEqual({ t: 'json' });
  });
});

describe('fieldOf', () => {
  it('maps a real port declaration', () => {
    const field = fieldOf(declared('flow.for_each', 'concurrency'));
    expect(field).toMatchObject({
      name: 'concurrency',
      title: 'Concurrency',
      required: false,
      isStatic: true,
      isLive: false,
      fallback: 1,
      control: { t: 'number', integer: true, min: 1, max: 64 },
    });
    expect(field.helper).toBe('How many items run at once.');
  });

  it('marks a live port and a choice port', () => {
    expect(fieldOf(declared('flow.while', 'condition')).isLive).toBe(true);
    expect(fieldOf(declared('flow.switch', 'mode')).control.t).toBe('choice');
  });

  it('maps every input of every shipped kind to a control', () => {
    for (const kind of NODE_REGISTRY.shipped()) {
      expect(fieldsOf(kind.inputs)).toHaveLength(kind.inputs.length);
    }
  });
});

describe('the form for plain static options', () => {
  const stop = NODE_REGISTRY.get('flow.stop');
  const fields = fieldsOf(stop?.inputs ?? []);

  it('keeps only static switch, number and plain text fields', () => {
    expect(formFields(fields).map((field) => field.name)).toEqual(['failed', 'cancelSelf']);
    expect(formKind(fieldOf(declared('flow.stop', 'message')))).toBe('text');
    expect(formFields(fields).map((field) => formKind(field))).toEqual(['switch', 'switch']);
  });

  it('leaves out live ports', () => {
    const loops = fieldsOf(NODE_REGISTRY.get('flow.while')?.inputs ?? []);
    expect(formFields(loops).map((field) => field.name)).toEqual([]);
  });

  it('builds an object schema the schema form can render', () => {
    expect(formSchema(fields)).toEqual({
      type: 'object',
      properties: {
        failed: {
          type: 'boolean',
          title: 'Failed',
          description: 'End the run as failed and run the failure handler.',
        },
        cancelSelf: {
          type: 'boolean',
          title: 'Cancel self',
          description: 'End the run as cancelled.',
        },
      },
    });
  });

  it('bounds numbers in the schema', () => {
    const together = fieldsOf(NODE_REGISTRY.get('flow.for_each')?.inputs ?? []);
    const schema = formSchema(together);
    expect(schema).toMatchObject({
      properties: { concurrency: { type: 'integer', minimum: 1, maximum: 64 } },
    });
  });

  it('shows the stored literal, else the default, else nothing', () => {
    expect(formValues(fields, { failed: { lit: true } })).toEqual({
      failed: true,
      cancelSelf: false,
    });
    expect(formValues(fields, undefined)).toEqual({ failed: false, cancelSelf: false });
    expect(formValues(fields, { failed: { wire: { from: 'x', port: 'y' } } })).toEqual({
      failed: false,
      cancelSelf: false,
    });
    const messages = fieldsOf([declared('flow.stop', 'message')]);
    expect(formValues(messages, undefined)).toEqual({});
  });
});

describe('formOps', () => {
  const fields = fieldsOf(NODE_REGISTRY.get('flow.stop')?.inputs ?? []);

  it('writes a changed value as one set', () => {
    expect(formOps('stop', fields, { failed: false }, { failed: true })).toEqual([
      { op: 'set', key: 'stop', ports: { failed: { lit: true } } },
    ]);
  });

  it('clears a removed value with an unset', () => {
    expect(formOps('stop', fields, { failed: true }, {})).toEqual([
      { op: 'unset', key: 'stop', ports: ['failed'] },
    ]);
  });

  it('writes nothing when nothing changed or the value is of the wrong type', () => {
    expect(formOps('stop', fields, { failed: true }, { failed: true })).toEqual([]);
    expect(formOps('stop', fields, { failed: false }, { failed: 'yes' })).toEqual([]);
  });

  it('checks the type each control accepts', () => {
    const [switchField] = fields;
    if (switchField === undefined) throw new Error('flow.stop has no inputs');
    expect(conforms(switchField, true)).toBe(false);
    const failed = fields.find((field) => field.name === 'failed');
    if (failed === undefined) throw new Error('flow.stop has no failed port');
    expect(conforms(failed, true)).toBe(true);
    expect(conforms(failed, 1)).toBe(false);
  });
});
