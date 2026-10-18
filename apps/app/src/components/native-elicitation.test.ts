import { describe, expect, it } from 'vitest';
import { formSchemaOf } from './native-elicitation';

describe('formSchemaOf', () => {
  it('returns the requested schema for a supported request', () => {
    const schema = { type: 'object', properties: { name: { type: 'string' } } };
    expect(formSchemaOf({ message: 'Hi', requestedSchema: schema })).toEqual(schema);
  });

  it('renders no fields for an unsupported request shape', () => {
    const schema = { type: 'object', properties: { nested: { type: 'object' } } };
    expect(formSchemaOf({ requestedSchema: schema })).toEqual({});
  });

  it('renders no fields when there is no schema', () => {
    expect(formSchemaOf({ url: 'https://example.com' })).toEqual({});
  });
});
