import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS as E,
  DRIVE_PLACEMENT,
  type DrivePlacement,
  type DriveRoot,
} from '@smarteverything/domain';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';

const HERE = 'b0000000-0000-4000-8000-000000000001';
const ELSEWHERE = 'b0000000-0000-4000-8000-000000000002';
const ME = 'c0000000-0000-4000-8000-000000000001';
const AT = '2026-11-07T10:00:00.000Z';

interface Seen {
  bridge: object | null;
  identity: { device_id: string | null; machine_id: string | null } | undefined;
  placements: readonly DrivePlacement[];
  roots: readonly DriveRoot[];
  calls: { endpoint: unknown; body: unknown }[];
}

const seen = vi.hoisted((): Seen => ({
  bridge: null,
  identity: undefined,
  placements: [],
  roots: [],
  calls: [],
}));

vi.mock('../../../design/platform', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  desktopBridge: (): object | null => seen.bridge,
}));
vi.mock('../../../queries/use-screen-query', () => ({
  useScreenQuery: (): unknown => ({ data: seen.identity }),
}));
vi.mock('../../../store/selectors', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDevice: (): null => null,
  useRows: (): readonly DrivePlacement[] => seen.placements,
}));
vi.mock('../../nas/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDriveRoots: (): readonly DriveRoot[] => seen.roots,
  useDriveSyncClients: (): readonly [] => [],
}));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): unknown => ({ busy: false, problem: null, run: (): void => undefined }),
}));
vi.mock('../../../api/transport', () => ({
  api: (): unknown => ({
    call: (endpoint: unknown, request: { readonly body: unknown }): Promise<unknown> => {
      seen.calls.push({ endpoint, body: request.body });
      return Promise.resolve(request.body);
    },
  }),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/card', () => ({
  Card: ({
    title,
    children,
  }: {
    readonly title: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('article', {}, createElement('h2', {}, title), children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('span', {}, children),
}));

const { ThisComputerCard, pauseBodiesOf, sendPause, thisComputerViewOf } =
  await import('./this-computer-card');

function placement(
  id: string,
  patch: Partial<DrivePlacement> = {},
  status: Partial<DrivePlacement['status']> = {},
): DrivePlacement {
  return DRIVE_PLACEMENT.parse({
    id,
    deviceId: HERE,
    rootId: ROOT_ID,
    folderItemId: null,
    mode: 'synced',
    localPath: '/home/me/Photos',
    enabled: true,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    status: {
      state: 'up_to_date',
      tier: null,
      basicLimits: null,
      readOnly: false,
      route: null,
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 0,
      pendingUploads: 0,
      reason: null,
      reportedAt: AT,
      ...status,
    },
    ...patch,
  });
}

const PHOTOS = placement('e0000000-0000-4000-8000-000000000001');
const PROJECTS = placement('e0000000-0000-4000-8000-000000000002', {
  rootId: OTHER_ROOT_ID,
  localPath: '/home/me/Projects',
});
const MOUNT = placement(
  'e0000000-0000-4000-8000-000000000003',
  { mode: 'mounted', localPath: '/home/me/Drive' },
  { state: 'mounted', tier: 'full' },
);
const OTHER = placement('e0000000-0000-4000-8000-000000000004', { deviceId: ELSEWHERE });

beforeEach(() => {
  seen.bridge = null;
  seen.identity = undefined;
  seen.placements = [PHOTOS, PROJECTS, MOUNT, OTHER];
  seen.roots = [rootRow(ROOT_ID, 'ready')];
  seen.calls = [];
});

describe('thisComputerViewOf', () => {
  it('lists only this computer’s synced folders with their local paths', () => {
    const view = thisComputerViewOf(HERE, seen.placements, seen.roots, []);
    expect(view.folders.map((folder) => [folder.name, folder.path])).toEqual([
      ['Photos', '/home/me/Photos'],
      ['Library folder', '/home/me/Projects'],
    ]);
    expect(view.mount.text).toBe('Mounted only');
    expect(view.paused).toBe(false);
    expect(view.state).toEqual({ text: 'Synced · up to date', tone: 'positive' });
  });

  it('says paused when every synced folder here is paused', () => {
    const paused = [{ ...PHOTOS, enabled: false }, { ...PROJECTS, enabled: false }, MOUNT];
    const view = thisComputerViewOf(HERE, paused, seen.roots, []);
    expect(view.paused).toBe(true);
    expect(view.state.text).toBe('Paused');
  });

  it('says what is wrong when one folder failed', () => {
    const failed = placement(
      PROJECTS.id,
      { rootId: OTHER_ROOT_ID },
      { state: 'failed', reason: 'Disk full' },
    );
    const view = thisComputerViewOf(HERE, [PHOTOS, failed], seen.roots, []);
    expect(view.state).toEqual({ text: 'Failed · Disk full', tone: 'critical' });
  });
});

describe('pause and resume', () => {
  it('sends one placement change per folder that changes', async () => {
    const bodies = pauseBodiesOf([PHOTOS, { ...PROJECTS, enabled: false }], false);
    await sendPause(bodies);
    expect(seen.calls).toEqual([
      {
        endpoint: E.setPlacement,
        body: {
          deviceId: HERE,
          rootId: ROOT_ID,
          folderItemId: null,
          mode: 'synced',
          localPath: '/home/me/Photos',
          enabled: false,
        },
      },
    ]);
  });

  it('resumes every paused folder', () => {
    const bodies = pauseBodiesOf(
      [
        { ...PHOTOS, enabled: false },
        { ...PROJECTS, enabled: false },
      ],
      true,
    );
    expect(bodies.map((body) => [body.localPath, body.enabled])).toEqual([
      ['/home/me/Photos', true],
      ['/home/me/Projects', true],
    ]);
  });
});

describe('ThisComputerCard', () => {
  it('is absent without the Desktop app bridge', () => {
    seen.identity = { device_id: HERE, machine_id: null };
    expect(renderToStaticMarkup(createElement(ThisComputerCard))).toBe('');
  });

  it('is absent until the Desktop app names this computer', () => {
    seen.bridge = {};
    seen.identity = { device_id: null, machine_id: null };
    expect(renderToStaticMarkup(createElement(ThisComputerCard))).toBe('');
  });

  it('shows this computer’s folders, mount line and actions in the Desktop app', () => {
    seen.bridge = {};
    seen.identity = { device_id: HERE, machine_id: null };
    const html = renderToStaticMarkup(createElement(ThisComputerCard));
    expect(html).toContain('This computer');
    expect(html).toContain('/home/me/Photos');
    expect(html).toContain('/home/me/Projects');
    expect(html).toContain('Mounted only');
    expect(html).toContain('Mount settings');
    expect(html).toContain('Choose folders');
    expect(html).toContain('Pause');
  });
});
