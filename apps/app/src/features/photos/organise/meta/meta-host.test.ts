import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StandardShellProps } from '../../../../components/page-shell/page-shell';
import { INITIAL_BACKUP_STATUS, type BackupStatus } from '../../backup/model/status';

vi.mock('expo-router', () => ({ Stack: { Screen: (): null => null } }));
vi.mock('../../components/photos-error-boundary', () => ({
  PhotosErrorBoundary: (): null => null,
}));
vi.mock('../../../../app-shell/tab-stack', async () => {
  const { PhotosFrame } = await import('../../components/photos-frame');
  return {
    TabStack: (): ReactNode =>
      createElement(
        'section',
        {},
        createElement(PhotosFrame, { active: 'library', children: null }),
        createElement(PhotosFrame, { active: 'albums', children: null }),
      ),
  };
});
vi.mock('../../../../components/sheet', () => ({
  Sheet: ({ open }: { readonly open: boolean }): ReactNode =>
    createElement('dialog', { 'data-open': String(open) }),
}));
vi.mock('../../../../design/platform', async (original) => ({
  ...(await original<object>()),
  isNative: (): boolean => false,
}));
vi.mock('../../../../design/size-class', async (original) => ({
  ...(await original<object>()),
  useAreaWidth: (): number => 1360,
}));
vi.mock('../../backup/model/status', async (original) => ({
  ...(await original<object>()),
  useBackupStatus: (): BackupStatus => INITIAL_BACKUP_STATUS,
}));
vi.mock('../../../drive', () => ({
  useLibraryRefresh: (): { readonly refreshing: boolean; readonly refresh: () => void } => ({
    refreshing: false,
    refresh: (): void => undefined,
  }),
}));
vi.mock('../../../../app-shell/main-pages', () => ({
  mainPageSettings: (): { readonly href: string; readonly label: string } => ({
    href: '/settings/photos',
    label: 'Photos settings',
  }),
}));
vi.mock('../../data', () => ({
  usePhotoRailCounts: (): { readonly data: undefined } => ({ data: undefined }),
  usePhotoInsights: (): { readonly data: undefined } => ({ data: undefined }),
}));
vi.mock('../../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../../components/charts', () => ({ SegmentBar: (): null => null }));
vi.mock('../../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../../components/interactive', () => ({ Interactive: (): null => null }));
vi.mock('../../../../components/summary-well', () => ({ SummaryWell: (): null => null }));
vi.mock('../../../../components/page-shell/page-shell', () => ({
  PageShell: (props: StandardShellProps): ReactNode => createElement('main', {}, props.children),
}));

const { default: PhotosLayout } = await import('../../../../../app/(app)/(photos)/_layout');
const { closeMetaEdit, openMetaEdit } = await import('./meta-request');

function sheets(): { readonly mounted: number; readonly open: number } {
  const markup = renderToStaticMarkup(createElement(PhotosLayout));
  return {
    mounted: markup.split('<dialog').length - 1,
    open: markup.split('data-open="true"').length - 1,
  };
}

afterEach(() => {
  closeMetaEdit();
});

describe('the date and location sheet host', () => {
  it('mounts one closed sheet for the whole Photos group however many screens are mounted', () => {
    expect(sheets()).toEqual({ mounted: 1, open: 0 });
  });

  it('opens exactly one sheet when two Photos screens are mounted', () => {
    openMetaEdit({ itemIds: ['a'], current: null });
    expect(sheets()).toEqual({ mounted: 1, open: 1 });
  });
});
