import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import { SchemaForm, joinLines, splitLines } from './schema-form';
import { Scalar } from './schema-scalar';

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Your name', description: 'Shown to guests' },
    count: { type: 'integer' },
    loud: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

const FIELD = z.object({
  label: z.string(),
  helper: z.string().optional(),
  disabled: z.boolean(),
  multiline: z.boolean().optional(),
  change: z.custom<(value: JsonValue) => void>((value) => typeof value === 'function'),
});

function fieldsOf(
  value: Readonly<Record<string, JsonValue>>,
  change: (next: Readonly<Record<string, JsonValue>>) => void,
  disabled = false,
): readonly { readonly type: unknown; readonly props: z.infer<typeof FIELD> }[] {
  const rendered = SchemaForm({ schema: SCHEMA, value, change, disabled });
  return z
    .array(z.custom((element) => isValidElement(element)))
    .parse(rendered)
    .map((element) => {
      if (!isValidElement(element)) throw new Error('expected a field element');
      return { type: element.type, props: FIELD.parse(element.props) };
    });
}

describe('SchemaForm', () => {
  it('renders one field per property with title or name, helper and disabled', () => {
    const fields = fieldsOf({}, vi.fn(), true);
    expect(fields.map((field) => field.props.label)).toEqual([
      'Your name',
      'count',
      'loud',
      'tags',
    ]);
    expect(fields[0]?.type).toBe(Scalar);
    expect(fields[0]?.props.helper).toBe('Shown to guests');
    expect(fields.every((field) => field.props.disabled)).toBe(true);
  });

  it('renders elicitation text fields single-line and array fields multi-line', () => {
    const fields = fieldsOf({}, vi.fn());
    expect(fields[0]?.props.multiline).toBe(false);
    expect(fields[1]?.props.multiline).toBe(false);
  });

  it('writes edited values into the form value', () => {
    const change = vi.fn();
    const fields = fieldsOf({ count: 2 }, change);
    fields[0]?.props.change('Ada');
    expect(change).toHaveBeenLastCalledWith({ count: 2, name: 'Ada' });
    fields[2]?.props.change(true);
    expect(change).toHaveBeenLastCalledWith({ count: 2, loud: true });
    fields[3]?.props.change(['x']);
    expect(change).toHaveBeenLastCalledWith({ count: 2, tags: ['x'] });
  });

  it('omits a non-text field that was cleared but keeps an empty text', () => {
    const change = vi.fn();
    const fields = fieldsOf({ count: 2, name: 'Ada' }, change);
    fields[1]?.props.change('');
    expect(change).toHaveBeenLastCalledWith({ name: 'Ada' });
    fields[0]?.props.change('');
    expect(change).toHaveBeenLastCalledWith({ count: 2, name: '' });
  });

  it('shows array values one per line and keeps the non-empty lines', () => {
    expect(joinLines(['a', 'b'])).toBe('a\nb');
    expect(joinLines(undefined)).toBe('');
    expect(splitLines('a\n \nb\n')).toEqual(['a', 'b']);
  });
});
