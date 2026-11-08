import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_ITEM, DRIVE_ROOT, type DriveItem } from '@smarteverything/domain';
import { FOLDER_ID, ROOT_ID, rootRow } from '../../nas/data/fixtures';
import type { FolderSlotContext } from '../folder/folder-model';

interface Seen {
  area: number;
  window: number;
  live: boolean;
  writable: boolean | null;
}

const seen = vi.hoisted((): Seen => ({ area: 1336, window: 1600, live: true, writable: null }));

interface Passed {
  readonly children?: ReactNode;
}

interface SubjectProps {
  readonly subject: { readonly item: DriveItem; readonly writable: boolean };
}

const pass = ({ children }: Passed): ReactNode => children ?? null;

const chain = vi.hoisted(() => {
  const animation = { duration: (): unknown => animation, easing: (): unknown => animation };
  return animation;
});

vi.mock('react-native', () => ({
  View: ({ children }: Passed): ReactNode => createElement('div', {}, children),
  Pressable: (): null => null,
  useWindowDimensions: (): { width: number; height: number } => ({
    width: seen.window,
    height: 900,
  }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: ({ children }: Passed): ReactNode => createElement('section', {}, children) },
  FadeIn: chain,
  FadeOut: chain,
  SlideInRight: chain,
  SlideOutRight: chain,
}));
vi.mock('../../../design/size-class', () => ({ useAreaWidth: (): number => seen.area }));
vi.mock('../../../design/motion', () => ({
  DURATION: { mediumOut: 200 },
  EASING: { standard: null },
  useMotion: (): { reduced: boolean } => ({ reduced: true }),
  entering: (): object => ({}),
  exiting: (): object => ({}),
}));
vi.mock('../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: seen.live ? 'live' : 'offline' }),
}));
vi.mock('../../../components/use-escape', () => ({ useEscape: (): void => undefined }));
vi.mock('../../../components/docked-pane', () => ({
  DockedPane: ({ children }: Passed): ReactNode => createElement('aside', {}, children),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode => createElement('p', {}, title),
}));
vi.mock('../../../components/files/file-glyph', () => ({ FileGlyph: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/text', () => ({ Text: pass }));
vi.mock('../folder/folder-footer', () => ({ runChange: (): void => undefined }));
vi.mock('../folder/folder-list', () => ({ entryKindOf: (): string => 'file' }));
vi.mock('./details-tabs', () => ({
  DetailsTabs: ({ subject }: SubjectProps): ReactNode => {
    seen.writable = subject.writable;
    return createElement('nav', {}, `tabs:${subject.item.name}`);
  },
}));
vi.mock('./item-pull-up', () => ({
  ItemPullUp: ({ subject }: SubjectProps): ReactNode =>
    createElement('dialog', {}, `pull-up:${subject.item.name}`),
}));

const { DetailsPane } = await import('./details-pane');

const file = DRIVE_ITEM.parse({
  id: 'c1b2c3d4-0000-4000-8000-000000000001',
  rootId: ROOT_ID,
  parentId: FOLDER_ID,
  relPath: 'Kitchen/plan.pdf',
  name: 'plan.pdf',
  modifiedAt: '2026-11-07T10:00:00.000Z',
  addedAt: '2026-11-07T10:00:00.000Z',
  openedAt: null,
  starred: false,
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

function contextOf(focused: DriveItem | null, readOnly = false): FolderSlotContext {
  const root = DRIVE_ROOT.parse({ ...rootRow(ROOT_ID, 'ready'), readOnly });
  return { root, folder: null, items: [], picked: [], focused, close: () => undefined };
}

function render(context: FolderSlotContext): string {
  return renderToStaticMarkup(createElement(DetailsPane, { context, slots: {} }));
}

describe('details pane', () => {
  beforeEach(() => {
    seen.area = 1336;
    seen.window = 1600;
    seen.live = true;
    seen.writable = null;
  });

  it('docks beside the list from 1024 wide', () => {
    const html = render(contextOf(file));
    expect(html).toContain('<aside>');
    expect(html).toContain('tabs:plan.pdf');
  });

  it('opens as a side sheet over the list below 1024', () => {
    seen.area = 800;
    seen.window = 884;
    const html = render(contextOf(file));
    expect(html).not.toContain('<aside>');
    expect(html).toContain('tabs:plan.pdf');
  });

  it('opens the item pull-up on the phone', () => {
    seen.area = 412;
    seen.window = 412;
    expect(render(contextOf(file))).toContain('pull-up:plan.pdf');
  });

  it('asks for a pick when nothing is chosen at the top of a library folder', () => {
    expect(render(contextOf(null))).toContain('Nothing picked');
    seen.area = 412;
    seen.window = 412;
    expect(render(contextOf(null))).toBe('');
  });

  it('is read-only when offline or when the library folder is read-only', () => {
    render(contextOf(file));
    expect(seen.writable).toBe(true);
    render(contextOf(file, true));
    expect(seen.writable).toBe(false);
    seen.live = false;
    render(contextOf(file));
    expect(seen.writable).toBe(false);
  });
});
