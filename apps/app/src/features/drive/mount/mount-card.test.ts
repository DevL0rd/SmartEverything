import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_PLACEMENT, type DrivePlacement } from '@smarteverything/domain';
import { ROOT_ID } from '../../nas/data/fixtures';

const HERE = 'b0000000-0000-4000-8000-000000000001';
const ME = 'c0000000-0000-4000-8000-000000000001';
const AT = '2026-11-07T10:00:00.000Z';

interface Seen {
  bridge: object | null;
  identity: { device_id: string | null; machine_id: string | null } | undefined;
  placements: readonly DrivePlacement[];
}

const seen = vi.hoisted((): Seen => ({ bridge: null, identity: undefined, placements: [] }));

function Wrap({ children }: { readonly children?: ReactNode }): ReactNode {
  return createElement('div', {}, children);
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
  useRows: (): readonly DrivePlacement[] => seen.placements,
}));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): unknown => ({ busy: false, problem: null, run: (): void => undefined }),
}));
vi.mock('../../../store/demand-region', () => ({ DemandRegion: Wrap }));
vi.mock('../../../components/card', () => ({
  Card: ({
    title,
    action,
    children,
  }: {
    readonly title: string;
    readonly action?: ReactNode;
    readonly children: ReactNode;
  }): ReactNode => createElement('article', {}, createElement('h2', {}, title), action, children),
}));
vi.mock('../../../components/badge', () => ({
  Badge: ({ label }: { readonly label: string }): ReactNode => createElement('em', {}, label),
  Dot: (): null => null,
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({
    title,
    body,
    action,
  }: {
    readonly title: string;
    readonly body?: string;
    readonly action?: { readonly label: string };
  }): ReactNode => createElement('aside', {}, [title, body, action?.label].join(' | ')),
}));
vi.mock('../../../components/metric-strip', () => ({
  MetricStrip: ({
    items,
  }: {
    readonly items: readonly { readonly label: string; readonly value: string }[];
  }): ReactNode =>
    createElement('dl', {}, items.map((item) => `${item.label} ${item.value}`).join(', ')),
}));
vi.mock('../../../components/text', () => ({ Text: Wrap }));
vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/progress-steps', () => ({
  ProgressSteps: ({
    steps,
  }: {
    readonly steps: readonly { readonly label: string }[];
  }): ReactNode => createElement('ol', {}, steps.map((step) => step.label).join(', ')),
}));
vi.mock('../../../components/copy-field', () => ({
  CopyField: ({ value }: { readonly value: string }): ReactNode => createElement('code', {}, value),
}));

const { ThisComputerMount } = await import('./this-computer-mount');

function mounted(status: Partial<DrivePlacement['status']> = {}, enabled = true): DrivePlacement {
  return DRIVE_PLACEMENT.parse({
    id: 'e0000000-0000-4000-8000-000000000001',
    deviceId: HERE,
    rootId: ROOT_ID,
    folderItemId: null,
    mode: 'mounted',
    localPath: '/home/me/Drive/Photos',
    enabled,
    hold: null,
    createdBy: ME,
    createdAt: AT,
    status: {
      state: 'mounted',
      tier: 'full',
      basicLimits: null,
      readOnly: true,
      route: 'local',
      cacheBytes: 0,
      pinnedBytes: 0,
      openFiles: 4,
      pendingUploads: 0,
      reason: null,
      reportedAt: AT,
      ...status,
    },
  });
}

function render(): string {
  return renderToStaticMarkup(createElement(ThisComputerMount));
}

beforeEach(() => {
  seen.bridge = { platform: 'linux' };
  seen.identity = { device_id: HERE, machine_id: null };
  seen.placements = [mounted()];
});

describe('ThisComputerMount', () => {
  it('is absent outside the Desktop app', () => {
    seen.bridge = null;
    expect(render()).toBe('');
  });

  it('shows the read-only full drive with its tiles and actions', () => {
    const html = render();
    expect(html).toContain('Drive on this computer');
    expect(html).toContain('<em>Full drive · read only</em>');
    expect(html).toContain('mounted at /home/me/Drive/Photos');
    expect(html).toContain('Open now 4');
    expect(html).toContain('Writes Read only');
    expect(html).toContain('Read only for now');
    expect(html).toContain('<button>Open in Files</button>');
    expect(html).toContain('<button>Unmount</button>');
    expect(html).toContain('Editing on the drive arrives with write-back');
    expect(html).not.toContain('Full drive needs fuse3');
  });

  it('shows Mount stopped with the reason and Show log', () => {
    seen.placements = [mounted({ state: 'stopped', reason: 'The helper exited' })];
    expect(render()).toContain('Mount stopped | The helper exited | Show log');
  });

  it('offers Mount when the drive is unmounted', () => {
    seen.placements = [mounted({}, false)];
    const html = render();
    expect(html).toContain('<button>Mount</button>');
    expect(html).not.toContain('Open in Files');
    expect(html).not.toContain('Open now');
  });

  it('explains how to mount when nothing is mounted here', () => {
    seen.placements = [];
    const html = render();
    expect(html).toContain('The drive is not mounted here');
    expect(html).toContain('Open My Drive');
  });

  it('shows the macOS steps and the planned full drive on a Mac', () => {
    seen.bridge = { platform: 'darwin' };
    seen.placements = [];
    const html = render();
    expect(html).toContain('Drive in Finder');
    expect(html).toContain('Planned for macOS');
  });
});
