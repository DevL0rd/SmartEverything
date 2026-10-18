import { describe, expect, it } from 'vitest';
import { variantName } from './schema-values';

describe('naming the variants of a tool’s input schema', () => {
  it('uses the action, view or kind each variant is tied to', () => {
    expect(variantName({ type: 'object', properties: { action: { const: 'create' } } }, 0)).toBe(
      'create',
    );
    expect(variantName({ type: 'object', properties: { view: { const: 'summary' } } }, 1)).toBe(
      'summary',
    );
    expect(variantName({ type: 'object', properties: { kind: { const: 'device' } } }, 2)).toBe(
      'device',
    );
  });

  it('falls back to the type and position, and names the reset variant', () => {
    expect(variantName({ type: 'string' }, 1)).toBe('string 2');
    expect(variantName({ type: 'null' }, 0)).toBe('Reset override');
  });
});
