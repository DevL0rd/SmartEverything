import { checkValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { TEXT_MAX_LENGTH, describeProperty, fromDevice, type MiotProperty } from '../src';

const STRING_PROPERTY: MiotProperty = {
  iid: 1,
  type: 'urn:miot-spec-v2:property:ai-object-list:00000001:m:1',
  description: 'ai object list',
  format: 'string',
  access: ['read', 'notify'],
};

function deviceJson(entries: number): string {
  return JSON.stringify(
    Array.from({ length: entries }, (_, index) => ({
      id: index,
      name: `object-${String(index)}`,
      box: [index, index + 1, index + 2, index + 3],
    })),
  );
}

describe('device produced text', () => {
  it('accepts a device JSON string far longer than the old 4096 limit', () => {
    const json = deviceJson(600);
    expect(json.length).toBeGreaterThan(4096);
    expect(json.length).toBeLessThan(TEXT_MAX_LENGTH);
    const { descriptor, codec } = describeProperty(STRING_PROPERTY);
    expect(descriptor).toStrictEqual({ kind: 'text', maxLength: TEXT_MAX_LENGTH });
    const value = fromDevice('ai-object-list', codec, json);
    expect(checkValue(descriptor, value)).toBe(json);
  });

  it('still refuses text beyond the raised limit', () => {
    const { descriptor } = describeProperty(STRING_PROPERTY);
    expect(() => checkValue(descriptor, 'x'.repeat(TEXT_MAX_LENGTH + 1))).toThrow();
  });
});
