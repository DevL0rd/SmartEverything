import { describe, expect, it, vi } from 'vitest';
import { organiseMenuItems, type OrganiseActions } from './actions';

const meta = vi.hoisted(() => ({ opened: vi.fn() }));

vi.mock(import('./meta/meta-request'), async (original) => ({
  ...(await original()),
  openMetaEdit: meta.opened,
}));

const ITEM = '00000000-0000-4000-8000-0000000000a1';

function actionsOf(busy = false): OrganiseActions {
  return { busy, archive: vi.fn(), unarchive: vi.fn(), lock: vi.fn() };
}

describe('organise actions', () => {
  it('offers date and location, archive and the locked folder for the picked items', () => {
    const actions = actionsOf();
    const gone = vi.fn();
    const saved = vi.fn();
    const items = organiseMenuItems({
      actions,
      itemIds: [ITEM],
      current: null,
      archived: false,
      onGone: gone,
      onSaved: saved,
    });
    expect(items.map((item) => item.id)).toEqual(['edit-meta', 'archive', 'lock']);
    for (const item of items) item.onPress();
    expect(meta.opened).toHaveBeenCalledWith({ itemIds: [ITEM], current: null, onSaved: saved });
    expect(actions.archive).toHaveBeenCalledWith([ITEM], gone);
    expect(actions.lock).toHaveBeenCalledWith([ITEM], gone);
  });

  it('disables every action with nothing picked and the moves while one runs', () => {
    expect(
      organiseMenuItems({
        actions: actionsOf(),
        itemIds: [],
        current: null,
        archived: false,
      }).every((item) => item.disabled === true),
    ).toBe(true);
    const busy = organiseMenuItems({
      actions: actionsOf(true),
      itemIds: [ITEM],
      current: null,
      archived: false,
    });
    expect(busy.map((item) => item.disabled)).toEqual([false, true, true]);
  });

  it('offers Unarchive for an archived photo and waits while its state is unknown', () => {
    const actions = actionsOf();
    const archived = organiseMenuItems({ actions, itemIds: [ITEM], current: null, archived: true });
    expect(archived.map((item) => item.id)).toEqual(['edit-meta', 'unarchive', 'lock']);
    archived[1]?.onPress();
    expect(actions.unarchive).toHaveBeenCalledWith([ITEM]);
    expect(actions.archive).not.toHaveBeenCalled();
    const unknown = organiseMenuItems({ actions, itemIds: [ITEM], current: null, archived: null });
    expect(unknown.map((item) => [item.id, item.disabled])).toEqual([
      ['edit-meta', false],
      ['archive', true],
      ['lock', false],
    ]);
  });
});
