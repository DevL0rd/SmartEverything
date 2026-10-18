import { describe, expect, it } from 'vitest';
import { deviceOfKind } from './use-plugin-device';

describe('deviceOfKind', () => {
  const router = { id: 'r', kind: 'router', name: 'Router' };
  const lamp = { id: 'l', kind: 'light', name: 'Lamp' };

  it('returns the very same device while only other devices change', () => {
    const before = deviceOfKind([router, lamp], 'router');
    const after = deviceOfKind(
      [router, { ...lamp, name: 'Lamp 2' }, { ...lamp, id: 'l2' }],
      'router',
    );
    expect(after).toBe(before);
  });

  it('returns a new device when the one of its kind changes', () => {
    const renamed = { ...router, name: 'Gateway' };
    expect(deviceOfKind([renamed, lamp], 'router')).toBe(renamed);
    expect(deviceOfKind([renamed, lamp], 'router')).not.toBe(router);
  });

  it('returns null when no device has the kind', () => {
    expect(deviceOfKind([lamp], 'router')).toBeNull();
  });
});
