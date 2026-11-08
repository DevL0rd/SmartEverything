import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveRootAdd } from '@smarteverything/domain';

interface Seen {
  added: DriveRootAdd[];
}

const seen = vi.hoisted((): Seen => ({ added: [] }));

const ROOT_ID = '00000000-0000-4000-8000-000000000201';

const stub = (): null => null;

vi.mock('react-native', () => ({ View: stub }));
vi.mock('../../../api/drive', () => ({
  addDriveRoot: (body: DriveRootAdd): Promise<{ readonly id: string }> => {
    seen.added.push(body);
    return Promise.resolve({ id: ROOT_ID });
  },
}));
vi.mock('../../../components/button', () => ({ Button: stub }));
vi.mock('../../../components/charts', () => ({ SegmentBar: stub }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: stub }));
vi.mock('../../../components/error-state', () => ({ ErrorState: stub }));
vi.mock('../../../components/icon', () => ({ Icon: stub }));
vi.mock('../../../components/interactive', () => ({ Interactive: stub }));
vi.mock('../../../components/list-row', () => ({ ListRow: stub }));
vi.mock('../../../components/rows', () => ({ SwitchRow: stub }));
vi.mock('../../../components/section', () => ({ List: stub, Section: stub }));
vi.mock('../../../components/segmented', () => ({ Segmented: stub }));
vi.mock('../../../components/sheet', () => ({ Sheet: stub }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stub }));
vi.mock('../../../components/text', () => ({ Text: stub }));
vi.mock('../../../components/text-field', () => ({ TextField: stub }));
vi.mock('../../../store/mutation', () => ({ useMutationState: stub }));
vi.mock('../../computers', () => ({ FolderPickerSheet: stub }));
vi.mock('../../nas/data', () => ({ useDriveRoots: stub, useDriveVolumes: stub }));

const { EMPTY_ROOT_DRAFT, addRoot, addRootBodyOf, skipPatternsOf, suggestedNameOf } =
  await import('./add-root-sheet');
const { volumeOfPath } = await import('./volume-picker');

const MEDIA = {
  mountId: 'mount-media',
  fsType: 'ext4',
  network: false,
  mountPoint: '/mnt/media',
  totalBytes: 4_000,
  freeBytes: 2_200,
  rootIds: [],
} as const;

const NAS = {
  mountId: 'mount-nas',
  fsType: 'zfs',
  network: false,
  mountPoint: '/srv',
  totalBytes: 9_000,
  freeBytes: 6_000,
  rootIds: [],
} as const;

const VOLUMES = [MEDIA, NAS];

describe('addRootBodyOf', () => {
  it('asks for nothing until a disk or folder is chosen', () => {
    expect(addRootBodyOf(EMPTY_ROOT_DRAFT, VOLUMES)).toBeNull();
  });

  it('adds a whole disk as a volume named after its mount point', () => {
    const draft = { ...EMPTY_ROOT_DRAFT, mountId: MEDIA.mountId };
    expect(addRootBodyOf(draft, VOLUMES)).toEqual({
      kind: 'volume',
      path: '/mnt/media',
      label: 'media',
      scope: 'home',
      ownerProfileId: null,
      readOnly: false,
      versions: true,
      inPhotos: false,
      skipPatterns: [],
      includeHidden: false,
    });
    expect(suggestedNameOf(draft, VOLUMES)).toBe('media');
  });

  it('adds a chosen folder with its name, skip patterns and hidden files', () => {
    const draft = {
      ...EMPTY_ROOT_DRAFT,
      mountId: NAS.mountId,
      folder: '/srv/archive',
      label: '  Archive  ',
      inPhotos: true,
      includeHidden: true,
      skip: '**/node_modules/**\n\n  *.tmp  \n',
    };
    expect(addRootBodyOf(draft, VOLUMES)).toEqual({
      kind: 'folder',
      path: '/srv/archive',
      label: 'Archive',
      scope: 'home',
      ownerProfileId: null,
      readOnly: false,
      versions: true,
      inPhotos: true,
      skipPatterns: ['**/node_modules/**', '*.tmp'],
      includeHidden: true,
    });
  });

  it('keeps no versions for a folder everyone can only view', () => {
    const draft = {
      ...EMPTY_ROOT_DRAFT,
      mountId: MEDIA.mountId,
      access: 'view' as const,
      versions: true,
    };
    expect(addRootBodyOf(draft, VOLUMES)).toMatchObject({
      readOnly: true,
      versions: false,
    });
  });

  it('honours turning versions off for an editable folder', () => {
    const draft = { ...EMPTY_ROOT_DRAFT, mountId: MEDIA.mountId, versions: false };
    expect(addRootBodyOf(draft, VOLUMES)).toMatchObject({ readOnly: false, versions: false });
  });
});

describe('skipPatternsOf', () => {
  it('reads one pattern per line and drops blank lines', () => {
    expect(skipPatternsOf(' a \n\n b\n')).toEqual(['a', 'b']);
    expect(skipPatternsOf('')).toEqual([]);
  });
});

describe('volumeOfPath', () => {
  it('finds the innermost disk that holds a chosen folder', () => {
    const inner = { ...MEDIA, mountId: 'mount-inner', mountPoint: '/srv/media' };
    expect(volumeOfPath('/srv/media/films', [NAS, inner])?.mountId).toBe('mount-inner');
    expect(volumeOfPath('/srv/archive', [NAS, inner])?.mountId).toBe('mount-nas');
    expect(volumeOfPath('/srvx/other', [NAS])).toBeNull();
    expect(volumeOfPath('/mnt/media', VOLUMES)?.mountId).toBe('mount-media');
  });
});

describe('addRoot', () => {
  beforeEach(() => {
    seen.added = [];
  });

  it('sends the request to the hub once', async () => {
    const body = addRootBodyOf({ ...EMPTY_ROOT_DRAFT, mountId: MEDIA.mountId }, VOLUMES);
    expect(body).not.toBeNull();
    if (body === null) return;
    await addRoot(body);
    expect(seen.added).toEqual([body]);
  });
});
