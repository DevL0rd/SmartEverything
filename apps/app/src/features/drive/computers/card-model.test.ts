import { describe, expect, it } from 'vitest';
import { cardActionsOf, placementCountOf } from './card-model';
import { placement } from './placement-fixture';

describe('the computer card actions', () => {
  it('leads with Browse files when the viewer may see the files', () => {
    const actions = cardActionsOf(true);
    expect(actions.map((action) => action.id)).toEqual(['browse', 'synced', 'mounted']);
    expect(
      actions.filter((action) => action.variant === 'filled').map((action) => action.id),
    ).toEqual(['browse']);
  });

  it('hides Browse files without the files scope and makes Sync the primary', () => {
    for (const scope of [false, null]) {
      const actions = cardActionsOf(scope);
      expect(actions.map((action) => action.id)).toEqual(['synced', 'mounted']);
      expect(
        actions.filter((action) => action.variant === 'filled').map((action) => action.id),
      ).toEqual(['synced']);
    }
  });
});

describe('the compact placement count', () => {
  it('counts synced and mounted folders', () => {
    const second = 'e0000000-0000-4000-8000-000000000002';
    const third = 'e0000000-0000-4000-8000-000000000003';
    expect(
      placementCountOf('Workstation', [
        placement({ mode: 'synced' }),
        placement({ id: second, mode: 'synced' }),
        placement({ id: third }),
      ]),
    ).toBe('2 synced · 1 mounted');
    expect(placementCountOf('Workstation', [placement()])).toBe('1 mounted');
  });

  it('says when nothing is placed on the computer', () => {
    expect(placementCountOf('Workstation', [])).toBe(
      'Nothing is synced or mounted on Workstation yet.',
    );
  });
});
