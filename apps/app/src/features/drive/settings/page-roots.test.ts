import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ROOT, type DriveRoot } from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';

const stub = (): null => null;

vi.mock('react-native', () => ({ View: stub }));
vi.mock('../../../components/button', () => ({ Button: stub }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: stub }));
vi.mock('../../../components/list-row', () => ({ ListRow: stub }));
vi.mock('../../../components/section', () => ({ List: stub, Section: stub }));
vi.mock('../../../components/use-section-param', () => ({ useSectionParam: stub }));
vi.mock('../../../store/selectors', () => ({ useIsOwner: stub }));
vi.mock('../../nas/data', () => ({ useDriveRoots: stub }));
vi.mock('./add-root-sheet', () => ({ AddRootSheet: stub }));
vi.mock('./page', () => ({ DriveSettingsSection: stub }));

const {
  ADD_ROOT_PARAM,
  ADD_ROOT_SHEET,
  addRootHref,
  libraryRootsOf,
  rootLineOf,
  rootSettingsHref,
} = await import('./page-roots');

function root(id: string, patch: Partial<DriveRoot>): DriveRoot {
  return DRIVE_ROOT.parse({ ...rootRow(id, 'ready'), ...patch });
}

describe('libraryRootsOf', () => {
  it('lists the folders the whole home uses and leaves out private files', () => {
    const home = root(ROOT_ID, { label: 'Projects' });
    const own = root(OTHER_ROOT_ID, {
      label: 'Mine',
      scope: 'person',
      ownerProfileId: '00000000-0000-4000-8000-000000000301',
    });
    expect(libraryRootsOf([own, home]).map((entry) => entry.label)).toEqual(['Projects']);
  });
});

describe('rootLineOf', () => {
  it('says the size and file count of a folder that is watched', () => {
    expect(rootLineOf(root(ROOT_ID, { bytes: 2048, items: 1 }))).toBe(`${bytes(2048)} · 1 file`);
  });

  it('adds the state when the folder is not being watched normally', () => {
    expect(rootLineOf(root(ROOT_ID, { state: 'offline', stateReason: null }))).toBe(
      `${bytes(0)} · 0 files · Offline`,
    );
  });
});

describe('settings links', () => {
  it('opens the add sheet on the Drive settings page', () => {
    expect(addRootHref()).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['drive'], [ADD_ROOT_PARAM]: ADD_ROOT_SHEET },
    });
  });

  it('opens a library folder on its own settings page', () => {
    expect(rootSettingsHref(ROOT_ID)).toEqual({
      pathname: '/settings/[...page]',
      params: { page: ['drive', 'roots', ROOT_ID] },
    });
  });
});
