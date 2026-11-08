import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ROOT, type DriveRoot } from '@smarteverything/domain';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';

const stub = (): null => null;

vi.mock('react-native', () => ({ View: stub }));
vi.mock('../../../components/charts', () => ({ SegmentBar: stub }));
vi.mock('../../../components/icon', () => ({ Icon: stub }));
vi.mock('../../../components/interactive', () => ({ Interactive: stub }));
vi.mock('../../../components/list-row', () => ({ ListRow: stub }));
vi.mock('../../../components/section', () => ({ List: stub, Section: stub }));
vi.mock('../../../components/text', () => ({ Text: stub }));
vi.mock('../../computers', () => ({ FolderPickerSheet: stub }));

const { folderNameOf, volumeChoiceOf, volumeGroupsOf } = await import('./volume-picker');

function volume(
  mountId: string,
  patch: Partial<{ network: boolean; rootIds: readonly string[]; mountPoint: string }> = {},
): {
  readonly mountId: string;
  readonly fsType: string;
  readonly network: boolean;
  readonly mountPoint: string;
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly rootIds: readonly string[];
} {
  return {
    mountId,
    fsType: 'ext4',
    network: false,
    mountPoint: `/mnt/${mountId}`,
    totalBytes: 1000,
    freeBytes: 400,
    rootIds: [],
    ...patch,
  };
}

function wholeDisk(id: string, label: string): DriveRoot {
  const folder = rootRow(id, 'ready');
  return DRIVE_ROOT.parse({
    ...folder,
    kind: 'volume',
    label,
    bytes: 250,
    volume: { mountId: 'media', fsType: 'ext4', network: false },
  });
}

describe('volumeGroupsOf', () => {
  it('stacks the disks on the hub before network shares and drops empty kinds', () => {
    const groups = volumeGroupsOf(
      [volume('nfs', { network: true }), volume('media'), volume('nas')],
      [],
    );
    expect(
      groups.map((group) => [group.title, group.choices.map((c) => c.volume.mountId)]),
    ).toEqual([
      ['Disks on the hub', ['media', 'nas']],
      ['Network shares', ['nfs']],
    ]);
    expect(volumeGroupsOf([volume('media')], []).map((group) => group.kind)).toEqual(['disk']);
  });
});

describe('volumeChoiceOf', () => {
  it('marks a disk that is already a library folder as taken', () => {
    const choice = volumeChoiceOf(volume('media', { rootIds: [ROOT_ID] }), [
      wholeDisk(ROOT_ID, 'Media disk'),
    ]);
    expect(choice.takenBy).toBe('Media disk');
    expect(choice.note).toBeNull();
    expect(choice.segments).toEqual([
      { label: 'In Drive', value: 250, colour: 'primary' },
      { label: 'Other files', value: 350, colour: 'track' },
    ]);
  });

  it('counts the library folders on a disk that can still take more', () => {
    const choice = volumeChoiceOf(volume('nas', { rootIds: [ROOT_ID, OTHER_ROOT_ID] }), [
      rootRow(ROOT_ID, 'ready'),
      rootRow(OTHER_ROOT_ID, 'ready'),
    ]);
    expect(choice.takenBy).toBeNull();
    expect(choice.note).toBe('2 library folders here');
    expect(choice.detail).toContain('ext4');
  });
});

describe('folderNameOf', () => {
  it('names a folder after its last segment', () => {
    expect(folderNameOf('/srv/archive/')).toBe('archive');
    expect(folderNameOf('/')).toBe('/');
  });
});
