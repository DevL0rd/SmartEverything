import { describe, expect, it } from 'vitest';
import { bundleVersionOf } from './ui-bundle';

describe('the interface build a web bundle names', () => {
  it('takes the runtime version from the bundle manifest', () => {
    expect(bundleVersionOf({ id: 'a7054de0', runtimeVersion: 'web-1', createdAt: 'x' })).toBe(
      'web-1',
    );
  });

  it('names nothing when the manifest has no runtime version', () => {
    expect(bundleVersionOf({ id: 'a7054de0' })).toBeNull();
    expect(bundleVersionOf({ runtimeVersion: 42 })).toBeNull();
    expect(bundleVersionOf({ runtimeVersion: '' })).toBeNull();
  });

  it('names nothing when there is no manifest at all', () => {
    expect(bundleVersionOf(null)).toBeNull();
    expect(bundleVersionOf('not a manifest')).toBeNull();
  });

  it('keeps the name inside the length a log record allows', () => {
    expect(bundleVersionOf({ runtimeVersion: 'w'.repeat(80) })).toHaveLength(40);
  });
});
