import { describe, expect, it } from 'vitest';
import { editorSchema, inlineForm, paramsSchema, propertiesOf, secretText } from './action-schema';

describe('action parameter schemas', () => {
  it('opens any-value secrets for editing and keeps the flag on string parameters', () => {
    expect(paramsSchema('kvs_set')['properties']).toMatchObject({ value: {} });
    expect(secretText(propertiesOf(paramsSchema('kvs_set'))['value'] ?? {})).toBe(false);
    expect(secretText(propertiesOf(paramsSchema('device_password'))['password'] ?? {})).toBe(true);
  });

  it('edits flat parameters inline, including nullable and string-list ones', () => {
    expect(inlineForm(paramsSchema('device_password'))).toBe(true);
    expect(inlineForm(paramsSchema('certificate_put'))).toBe(true);
    expect(inlineForm(paramsSchema('device_reboot'))).toBe(true);
  });

  it('browses nested parameters instead of flattening them', () => {
    expect(inlineForm(paramsSchema('schedule_update'))).toBe(false);
    expect(inlineForm(paramsSchema('virtual_add'))).toBe(false);
    expect(inlineForm(paramsSchema('kvs_set'))).toBe(false);
    expect(inlineForm(paramsSchema('bthome_objects'))).toBe(false);
  });

  it('shows the wrapped object alone, or the form without the fixed fields', () => {
    expect(
      Object.keys(editorSchema('schedule_update', 'schedule', ['id'])['properties'] ?? {}),
    ).toStrictEqual(['enable', 'timespec', 'calls']);
    expect(
      Object.keys(editorSchema('kvs_set', undefined, ['key', 'etag'])['properties'] ?? {}),
    ).toStrictEqual(['value']);
  });
});
