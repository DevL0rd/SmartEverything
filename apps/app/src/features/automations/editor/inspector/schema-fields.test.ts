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
  isTextOnly,
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
      [{ t: 'entity', of: 'discord.channel' }, 'entity'],
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

  it('describes record fields and edits an open record as named typed values', () => {
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
    expect(controlOf({ t: 'record', values: { t: 'text' } })).toEqual({
      t: 'entries',
      item: { t: 'text' },
    });
    expect(controlOf({ t: 'record', values: { t: 'any' } })).toEqual({
      t: 'entries',
      item: { t: 'json' },
    });
  });

  it('turns a text port with a source into a picker, many for a list or a multiple hint', () => {
    expect(controlOf({ t: 'text' }, { optionsFrom: 'tools' })).toEqual({
      t: 'pick',
      source: 'tools',
      multiple: false,
    });
    expect(controlOf({ t: 'list', of: { t: 'text' } }, { optionsFrom: 'tools' })).toEqual({
      t: 'pick',
      source: 'tools',
      multiple: true,
    });
    expect(controlOf({ t: 'text' }, { optionsFrom: 'device.controls', multiple: true })).toEqual({
      t: 'pick',
      source: 'device.controls',
      multiple: true,
    });
  });

  it('wraps a port with an editor id around the control of its type', () => {
    expect(controlOf({ t: 'record', values: { t: 'any' } }, { editor: 'phone-action' })).toEqual({
      t: 'editor',
      id: 'phone-action',
      base: { t: 'entries', item: { t: 'json' } },
    });
  });

  it('types an any or param port by another port and leaves typed ports alone', () => {
    expect(controlOf({ t: 'any' }, { typedBy: 'control' })).toEqual({
      t: 'typedBy',
      port: 'control',
      base: { t: 'json' },
    });
    expect(controlOf({ t: 'list', of: { t: 'param', name: 'T' } }, { typedBy: 'value' })).toEqual({
      t: 'typedBy',
      port: 'value',
      base: { t: 'list', item: { t: 'json' } },
    });
    expect(controlOf({ t: 'boolean' }, { typedBy: 'control' })).toEqual({ t: 'switch' });
  });
});

function namesText(type: FlowType): boolean {
  if (type.t === 'optional' || type.t === 'list') return namesText(type.of);
  return type.t === 'text';
}

describe('ports with sources, editors and typed values', () => {
  it('reads the declarations of the real kinds', () => {
    expect(fieldOf(declared('device.set', 'control')).control.t).toBe('pick');
    expect(fieldOf(declared('device.set', 'to')).control).toMatchObject({
      t: 'typedBy',
      port: 'control',
    });
    expect(fieldOf(declared('ai.ask', 'tools')).control).toMatchObject({
      t: 'pick',
      source: 'tools',
      multiple: true,
    });
    expect(fieldOf(declared('computer.keys', 'keys')).control).toMatchObject({
      t: 'editor',
      id: 'key-combo',
    });
    expect(fieldOf(declared('logic.compare', 'b')).control).toMatchObject({
      t: 'typedBy',
      port: 'a',
    });
  });

  it('never leaves a port with a text source or an editor as a text or JSON box', () => {
    for (const kind of NODE_REGISTRY.shipped()) {
      for (const decl of kind.inputs) {
        const control = fieldOf(decl).control;
        if (decl.ui?.editor !== undefined) expect(control.t).toBe('editor');
        else if (decl.ui?.optionsFrom !== undefined && namesText(decl.type)) {
          expect([kind.id, decl.name, control.t]).toEqual([kind.id, decl.name, 'pick']);
        }
      }
    }
  });

  it('keeps record values with an editor in the Edit as text list and pickers out of it', () => {
    expect(isTextOnly(fieldOf(declared('device.set', 'control')).control)).toBe(false);
    expect(isTextOnly(fieldOf(declared('device.set', 'to')).control)).toBe(true);
  });

  it('keeps pickers out of the plain form', () => {
    const control = fieldOf(declared('device.set', 'control'));
    expect(formKind(control)).toBeNull();
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
      control: { t: 'number', integer: true, min: 1 },
    });
    expect(field.helper).toBe('How many items run at once. Any number, no upper limit.');
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
      properties: { concurrency: { type: 'integer', minimum: 1 } },
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
