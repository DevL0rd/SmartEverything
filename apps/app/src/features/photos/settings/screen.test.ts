import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HeaderAction } from '../../../components/page-header';

interface RailCounts {
  readonly library: number;
  readonly backupDevices: number;
}

interface Harness {
  native: boolean;
  live: boolean;
  counts: RailCounts | undefined;
}

const harness = vi.hoisted((): Harness => ({ native: false, live: true, counts: undefined }));

interface ViewProps {
  readonly className?: string;
  readonly children?: ReactNode;
}

vi.mock('react-native', () => ({
  View: ({ className, children }: ViewProps): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: ViewProps): ReactNode => createElement('p', null, children),
}));
vi.mock('../../../components/banner', () => ({
  Banner: ({ title, body }: { readonly title: string; readonly body: string }): ReactNode =>
    createElement('aside', null, `${title}: ${body}`),
}));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => harness.native }));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { readonly status: string } => ({
    status: harness.live ? 'live' : 'offline',
  }),
}));
vi.mock('../../../settings/settings-frame', () => ({
  SettingsFrame: ({
    page,
    actions,
    contentWidth,
    banner,
    children,
  }: ViewProps & {
    readonly page: string;
    readonly actions: readonly HeaderAction[];
    readonly contentWidth: string;
    readonly banner?: ReactNode;
  }): ReactNode =>
    createElement(
      'main',
      { 'data-page': page, 'data-width': contentWidth },
      actions.map((action) => createElement('button', { key: action.label }, action.label)),
      banner,
      children,
    ),
}));
vi.mock('../../../settings/settings-page', () => ({
  SettingsPageBody: ({
    BlocksLayout,
  }: {
    readonly BlocksLayout: ComponentType<{ readonly children: ReactNode }>;
  }): ReactNode =>
    createElement(
      BlocksLayout,
      null,
      createElement('section', { key: 'a' }, 'Sources'),
      createElement('section', { key: 'b' }, 'Backup'),
    ),
}));
vi.mock('../settings', () => ({ PHOTOS_PAGE: 'photos' }));
vi.mock('./model', () => ({
  offlineText: (local: boolean): string =>
    local
      ? 'Changing these settings needs your home hub. Backup on this device keeps going.'
      : 'Changing these settings needs your home hub.',
  summaryText: (items: number | null, devices: number | null): string | null =>
    items === null ? null : `${String(items)} items · ${String(devices)} devices backing up`,
}));
vi.mock('../local/source', () => ({
  localMediaSource: (): object | null => (harness.native ? {} : null),
}));
vi.mock('./link-cards', () => ({
  BackupLinkCard: (): ReactNode => createElement('a', null, 'Backup card'),
  DuplicatesLinkCard: (): ReactNode => createElement('a', null, 'Duplicates card'),
}));
vi.mock('../data/queries', () => ({
  usePhotoRailCounts: (): { readonly data: RailCounts | undefined } => ({
    data: harness.counts,
  }),
}));

const { PhotosSettingsScreen } = await import('./screen');

const render = (): string => renderToStaticMarkup(createElement(PhotosSettingsScreen));

describe('Photos settings screen', () => {
  it('opens Photos from the header and lays the sections out in columns on wide screens', () => {
    const html = render();
    expect(html).toContain('data-page="photos"');
    expect(html).toContain('data-width="full"');
    expect(html).toContain('<button>Open Photos</button>');
    expect(html.match(/web:break-inside-avoid/g)).toHaveLength(2);
  });

  it('shows the library counts only once the hub has answered', () => {
    harness.counts = undefined;
    expect(render()).not.toContain('items ·');
    harness.counts = { library: 5, backupDevices: 2 };
    expect(render()).toContain('<p>5 items · 2 devices backing up</p>');
    harness.counts = undefined;
  });

  it('leads with the Backup and Duplicates link cards for every person', () => {
    const html = render();
    expect(html.indexOf('Backup card')).toBeLessThan(html.indexOf('Sources'));
    expect(html).toContain('Duplicates card');
  });

  it('keeps one reading column on the phone', () => {
    harness.native = true;
    try {
      const html = render();
      expect(html).toContain('data-width="reading"');
      expect(html).not.toContain('web:columns-');
    } finally {
      harness.native = false;
    }
  });

  it('says the page is a snapshot while the hub is offline', () => {
    expect(render()).not.toContain('<aside>');
    harness.live = false;
    try {
      expect(render()).toContain(
        '<aside>Offline · showing the last snapshot: Changing these settings needs your home hub.</aside>',
      );
      harness.native = true;
      expect(render()).toContain('Backup on this device keeps going');
    } finally {
      harness.live = true;
      harness.native = false;
    }
  });
});
