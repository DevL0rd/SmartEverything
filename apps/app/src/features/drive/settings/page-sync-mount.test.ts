import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ENDPOINTS as E,
  DRIVE_PLACEMENT,
  type DrivePlacement,
  type DriveRoot,
} from '@smarteverything/domain';
import { bytes } from '../../../format/number';
import { OTHER_ROOT_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';

const HERE = 'b0000000-0000-4000-8000-000000000001';
const ME = 'c0000000-0000-4000-8000-000000000001';
const AT = '2026-11-07T10:00:00.000Z';

interface SwitchProps {
  readonly title: string;
  readonly value: boolean;
  readonly disabled?: boolean;
  readonly onChange: (next: boolean) => void;
}

interface Seen {
  bridge: object | null;
  identity: { device_id: string | null; machine_id: string | null } | undefined;
  placements: readonly DrivePlacement[];
  roots: readonly DriveRoot[];
  switches: SwitchProps[];
  work: Promise<void>[];
  calls: { endpoint: unknown; body: unknown }[];
}

const seen = vi.hoisted((): Seen => ({
  bridge: null,
  identity: undefined,
  placements: [],
  roots: [],
  switches: [],
  work: [],
  calls: [],
}));

function Wrap({ children }: { readonly children?: ReactNode }): ReactNode {
  return createElement('div', {}, children);
}

function row({
  title,
  subtitle,
  caption,
  value,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly caption?: string;
  readonly value?: string;
}): ReactNode {
  return createElement('li', {}, [title, subtitle, caption, value].filter(Boolean).join(' | '));
}

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
  useLoaded: (): boolean => true,
  useSyncStatus: (): { readonly status: string } => ({ status: 'live' }),
  useRows: (): readonly DrivePlacement[] => seen.placements,
}));
vi.mock('../../nas/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDriveRoots: (): readonly DriveRoot[] => seen.roots,
  useDriveSyncClients: (): readonly [] => [],
}));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): unknown => ({
    busy: false,
    problem: null,
    run: (work: () => Promise<void>): void => {
      seen.work.push(work());
    },
  }),
}));
vi.mock('../../../api/transport', () => ({
  api: (): unknown => ({
    call: (endpoint: unknown, request: { readonly body: unknown }): Promise<unknown> => {
      seen.calls.push({ endpoint, body: request.body });
      return Promise.resolve(request.body);
    },
  }),
}));
vi.mock('../../../store/demand-region', () => ({ DemandRegion: Wrap }));
vi.mock('../../computers/files/folder-picker-sheet', () => ({
  FolderPickerSheet: (): null => null,
}));
vi.mock('../../../components/list-row', () => ({ ListRow: row }));
vi.mock('../../../components/rows', () => ({
  NavRow: row,
  ValueRow: row,
  SwitchRow: (props: SwitchProps): ReactNode => {
    seen.switches.push(props);
    return createElement('li', {}, `${props.title} ${props.value ? 'on' : 'off'}`);
  },
}));
vi.mock('../../../components/section', () => ({
  Section: Wrap,
  List: ({
    title,
    footer,
    children,
  }: {
    readonly title?: string;
    readonly footer?: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('ul', {}, title, children, footer),
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
vi.mock('../../../components/text', () => ({ Text: Wrap }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/copy-field', () => ({
  CopyField: ({ value }: { readonly value: string }): ReactNode => createElement('code', {}, value),
}));
vi.mock('../../../components/progress-steps', () => ({
  ProgressSteps: ({
    steps,
  }: {
    readonly steps: readonly { readonly label: string }[];
  }): ReactNode => createElement('ol', {}, steps.map((step) => step.label).join(', ')),
}));

const { SyncMountSection } = await import('./page-sync-mount');

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

const SYNCED = placement('e0000000-0000-4000-8000-000000000001');
const MOUNTED = placement(
  'e0000000-0000-4000-8000-000000000002',
  { mode: 'mounted', rootId: OTHER_ROOT_ID, localPath: '/home/me/Drive/Projects' },
  { state: 'mounted', tier: 'full', readOnly: true, pinnedBytes: 2048 },
);

function render(): string {
  return renderToStaticMarkup(createElement(SyncMountSection));
}

function switchNamed(title: string): SwitchProps {
  const found = seen.switches.findLast((props) => props.title === title);
  if (found === undefined) throw new Error(`No switch ${title}`);
  return found;
}

beforeEach(() => {
  seen.bridge = { platform: 'linux' };
  seen.identity = { device_id: HERE, machine_id: null };
  seen.placements = [SYNCED, MOUNTED];
  seen.roots = [rootRow(ROOT_ID, 'ready')];
  seen.switches = [];
  seen.work = [];
  seen.calls = [];
});

describe('SyncMountSection', () => {
  it('is empty outside the Desktop app', () => {
    seen.bridge = null;
    const html = render();
    expect(html).not.toContain('Sync on this computer');
    expect(html).not.toContain('Mount the drive');
  });

  it('lists this computer’s synced folder and mount point with the tier state', () => {
    const html = render();
    expect(html).toContain('Photos | /home/me/Photos | Synced · up to date');
    expect(html).toContain('Library folder | /home/me/Drive/Projects');
    expect(html).toContain('Drive type');
    expect(html).toContain('Full drive · read only');
    expect(html).toContain(`Kept offline | ${bytes(2048)}`);
    expect(switchNamed('Sync on this computer').value).toBe(true);
    expect(switchNamed('Mount the drive').value).toBe(true);
  });

  it('unmounts by turning off only the mounted folder', async () => {
    render();
    switchNamed('Mount the drive').onChange(false);
    await Promise.all(seen.work);
    expect(seen.calls).toEqual([
      {
        endpoint: E.setPlacement,
        body: {
          deviceId: HERE,
          rootId: OTHER_ROOT_ID,
          folderItemId: null,
          mode: 'mounted',
          localPath: '/home/me/Drive/Projects',
          enabled: false,
        },
      },
    ]);
  });

  it('pauses sync for the synced folder only', async () => {
    render();
    switchNamed('Sync on this computer').onChange(false);
    await Promise.all(seen.work);
    expect(seen.calls.map((call) => call.body)).toEqual([
      expect.objectContaining({ mode: 'synced', localPath: '/home/me/Photos', enabled: false }),
    ]);
  });

  it('says how to mount when nothing is mounted and keeps the switches off', () => {
    seen.placements = [];
    const html = render();
    expect(html).toContain('No synced folders here');
    expect(html).toContain('Not mounted here');
    expect(switchNamed('Mount the drive')).toMatchObject({ value: false, disabled: true });
  });

  it('shows the fuse3 steps when the mount fell back to Basic on Linux', () => {
    seen.placements = [
      placement(
        MOUNTED.id,
        { mode: 'mounted' },
        {
          state: 'mounted',
          tier: 'basic',
          basicLimits: { maxFileBytes: null, wholeFileOpen: false, offline: false },
        },
      ),
    ];
    const html = render();
    expect(html).toContain('Full drive needs fuse3');
    expect(html).toContain('Basic is ready, Install fuse3, Full drive turns on by itself');
  });
});
