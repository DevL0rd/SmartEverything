import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID, rootRow } from '../data/fixtures';

interface Passed {
  readonly children?: ReactNode;
}

interface Tab {
  readonly key: string;
  readonly label: string;
}

vi.mock('react-native', () => ({
  View: ({ children }: Passed): ReactNode => createElement('div', {}, children),
  ScrollView: ({ children }: Passed): ReactNode => createElement('main', {}, children),
}));
vi.mock('../../../components/tabs-bar', () => ({
  TabsBar: ({
    items,
    active,
  }: {
    readonly items: readonly Tab[];
    readonly active: string;
  }): ReactNode =>
    createElement('nav', {}, `${items.map((item) => item.label).join(',')}|${active}`),
}));
vi.mock('./info-tab', () => ({ InfoTab: (): ReactNode => 'info-body' }));
vi.mock('./preview-tab', () => ({ PreviewTab: (): ReactNode => 'preview-body' }));
vi.mock('./versions-tab', () => ({ VersionsTab: (): ReactNode => 'versions-body' }));
vi.mock('./activity-tab', () => ({ ActivityTab: (): ReactNode => 'activity-body' }));
vi.mock('../share/sharing-tab', () => ({ SharingTab: (): ReactNode => 'sharing-body' }));

const { DetailsTabs } = await import('./details-tabs');
const { rememberTab } = await import('./details-model');

const item = DRIVE_ITEM.parse({
  id: 'c1b2c3d4-0000-4000-8000-000000000001',
  rootId: ROOT_ID,
  parentId: FOLDER_ID,
  relPath: 'Kitchen/plan.pdf',
  name: 'plan.pdf',
  modifiedAt: '2026-11-07T10:00:00.000Z',
  addedAt: '2026-11-07T10:00:00.000Z',
  openedAt: null,
  starred: false,
  shared: false,
  rev: 1,
  etag: 'etag',
  outside: false,
  addedByProfileId: null,
  remoteId: null,
  remoteRev: null,
  kind: 'document',
  mime: 'application/pdf',
  bytes: 1200,
  sha256: null,
  integrity: 'unknown',
  thumb: { state: 'none' },
});

const subject = {
  root: rootRow(ROOT_ID, 'ready'),
  item,
  label: 'Shared Drive',
  access: 'shared',
  writable: true,
} as const;

function render(): string {
  return renderToStaticMarkup(
    createElement(DetailsTabs, { subject, slots: {}, share: (): void => undefined, pane: true }),
  );
}

describe('details tabs', () => {
  it('opens on Info and lists every tab of a file, Sharing included', () => {
    rememberTab('info');
    const html = render();
    expect(html).toContain('Preview,Info,Versions,Activity,Sharing|info');
    expect(html).toContain('info-body');
  });

  it('keeps the last tab and draws its body', () => {
    rememberTab('versions');
    expect(render()).toContain('versions-body');
    rememberTab('sharing');
    expect(render()).toContain('sharing-body');
    rememberTab('activity');
    expect(render()).toContain('activity-body');
    rememberTab('info');
  });
});
