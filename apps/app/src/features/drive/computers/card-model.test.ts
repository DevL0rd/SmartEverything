import { describe, expect, it } from 'vitest';
import { cardActionsOf, placementCountOf } from './card-model';
import { placement } from './placement-fixture';

describe('the computer card actions', () => {
  it('leads with Browse files when the viewer may see the files', () => {
    const actions = cardActionsOf(true);
    expect(actions.map((action) => action.id)).toEqual(['browse', 'synced']);
    expect(
      actions.filter((action) => action.variant === 'filled').map((action) => action.id),
    ).toEqual(['browse']);
  });

  it('hides Browse files without the files scope and keeps Sync a folder tonal', () => {
    for (const scope of [false, null]) {
      const actions = cardActionsOf(scope);
      expect(actions.map((action) => action.id)).toEqual(['synced']);
      expect(actions.map((action) => action.variant)).toEqual(['tonal']);
    }
  });
});

describe('the compact placement count', () => {
  it('counts only the synced folders, since the mount has its own toggle', () => {
    const second = 'e0000000-0000-4000-8000-000000000002';
    const third = 'e0000000-0000-4000-8000-000000000003';
    expect(
      placementCountOf('Workstation', [
        placement({ mode: 'synced' }),
        placement({ id: second, mode: 'synced' }),
        placement({ id: third }),
      ]),
    ).toEqual({ line: '2 synced folders', tone: 'variant' });
  });

  it('says when nothing is synced to the computer', () => {
    expect(placementCountOf('Workstation', [placement()]).line).toBe(
      'No folders are synced to Workstation yet.',
    );
  });

  it('counts the failed and held folders in the line and its tone', () => {
    const failed = placement(
      { id: 'e0000000-0000-4000-8000-000000000004', mode: 'synced' },
      { state: 'failed', reason: 'Full' },
    );
    const held = placement({
      id: 'e0000000-0000-4000-8000-000000000005',
      mode: 'synced',
      hold: 'no_access',
    });
    expect(placementCountOf('Laptop', [placement({ mode: 'synced' }), failed, held])).toEqual({
      line: '3 synced folders · 1 failed · 1 on hold',
      tone: 'critical',
    });
    expect(placementCountOf('Laptop', [held])).toEqual({
      line: '1 synced folder · 1 on hold',
      tone: 'warning',
    });
  });
});
