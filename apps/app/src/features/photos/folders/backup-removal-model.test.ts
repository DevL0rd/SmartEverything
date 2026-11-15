import { describe, expect, it } from 'vitest';
import { keptLine, namesOf, planOf, removalConfirm, stoppedIds } from './backup-removal-model';

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';
const C = '00000000-0000-4000-8000-0000000000c1';
const D = '00000000-0000-4000-8000-0000000000d1';

const copies = {
  items: [
    { itemId: A, bytes: 1024 * 1024, localIds: ['1', '1b'] },
    { itemId: B, bytes: 1024 * 1024, localIds: ['2'] },
  ],
  kept: new Map([
    [C, 'other_device'],
    [D, 'album'],
  ] as const),
};

describe('turning off backup for a folder', () => {
  it('plans the hub copies to remove with the space they free and the local ids to forget', () => {
    const plan = planOf(copies);
    expect(plan.itemIds).toEqual([A, B]);
    expect(plan.localIds).toEqual(['1', '1b', '2']);
    expect(plan.bytes).toBe(2 * 1024 * 1024);
    expect(plan.kept).toEqual({
      other_device: 1,
      other_folder: 0,
      shared: 0,
      edited: 0,
      album: 1,
    });
  });

  it('asks first with the count, the space and the items that stay', () => {
    const request = removalConfirm(planOf(copies), ['Camera'], 'phone');
    expect(request).toMatchObject({
      title: 'Stop backing up Camera?',
      confirmLabel: 'Stop and remove',
      alternateLabel: 'Stop and keep copies',
      cancelLabel: 'Keep backing up',
      tone: 'destructive',
    });
    expect(request.body).toContain('2 photos and videos');
    expect(request.body).toContain('2.0\u00a0MB');
    expect(request.body).toContain('The files on this phone are not touched.');
    expect(keptLine(planOf(copies))).toBe(
      '2 stay on the hub: 1 also came from another device, 1 is in albums.',
    );
  });

  it('names several folders by count and leaves the kept line out when nothing stays', () => {
    const plan = planOf({ items: copies.items, kept: new Map() });
    const request = removalConfirm(plan, ['Camera', 'Saved'], 'computer');
    expect(request.title).toBe('Stop backing up 2 folders?');
    expect(keptLine(plan)).toBeNull();
    expect(request.body).not.toContain('stay on the hub');
  });

  it('finds every folder a change stops, including when backup covered all folders', () => {
    const known = ['camera', 'saved', 'screens'];
    expect(
      stoppedIds({ enabled: true, albumIds: [] }, { enabled: true, albumIds: ['saved'] }, known),
    ).toEqual(['camera', 'screens']);
    expect(
      stoppedIds(
        { enabled: true, albumIds: ['camera'] },
        { enabled: false, albumIds: ['camera'] },
        known,
      ),
    ).toEqual(['camera']);
    expect(
      stoppedIds({ enabled: true, albumIds: ['camera'] }, { enabled: true, albumIds: [] }, known),
    ).toEqual([]);
    expect(
      stoppedIds({ enabled: false, albumIds: [] }, { enabled: false, albumIds: ['camera'] }, known),
    ).toEqual([]);
  });

  it('names the stopped folders from the folder list', () => {
    expect(
      namesOf(
        ['b', 'a'],
        [
          { id: 'a', title: 'Camera' },
          { id: 'b', title: 'Saved' },
        ],
      ),
    ).toEqual(['Saved', 'Camera']);
  });
});
