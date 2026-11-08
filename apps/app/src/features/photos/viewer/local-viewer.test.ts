import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMediaItem } from '../local/types';
import { viewerTargetOf } from './params';

describe('local photo routes', () => {
  it('preserves opaque device IDs and rejects empty local IDs', () => {
    expect(viewerTargetOf({ itemId: 'local:android:media/42' })?.itemId).toBe(
      'local:android:media/42',
    );
    expect(viewerTargetOf({ itemId: 'local:desktop:abc' })?.itemId).toBe('local:desktop:abc');
    expect(viewerTargetOf({ itemId: 'local:' })).toBeNull();
    expect(viewerTargetOf({ itemId: 'file:///private/photo.jpg' })).toBeNull();
  });
});

interface LocalImageProps {
  readonly source: { readonly uri: string; readonly cacheKey: string };
  readonly onError: (event: { readonly error: string }) => void;
}

const shown = vi.hoisted(
  (): {
    items: readonly LocalMediaItem[];
    images: LocalImageProps[];
    unavailable: boolean;
  } => ({ items: [], images: [], unavailable: false }),
);

function childrenOf({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

const resolve = vi.hoisted(() => vi.fn(() => Promise.resolve('content://media/images/7')));
vi.mock('../local/source', () => ({ resolveLocalMedia: resolve }));
vi.mock('../local/use-local-library', () => ({
  useLocalLibrary: (): { readonly state: 'ready'; readonly items: readonly LocalMediaItem[] } => ({
    state: 'ready',
    items: shown.items,
  }),
}));
vi.mock('../local/tiles', () => ({ useLocalBackupEntries: (): readonly never[] => [] }));
vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: childrenOf,
}));
vi.mock('expo-image', () => ({
  Image: (props: LocalImageProps): null => {
    shown.images.push(props);
    shown.unavailable = false;
    return null;
  },
}));
vi.mock('../../../components/text', () => ({ Text: (): null => null }));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../../components/icon-button', () => ({ IconButton: (): null => null }));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: (): null => {
    shown.unavailable = true;
    return null;
  },
}));
vi.mock('../../../components/zoomable', () => ({ Zoomable: childrenOf }));
vi.mock('../../../design/theme-scope', () => ({ ThemeScope: childrenOf }));
vi.mock('./local-playback', () => ({ LocalPlayback: (): null => null }));
vi.mock('./close', () => ({ closeViewer: (): void => undefined }));

const { LocalViewer } = await import('./local-viewer');
let root: Root | null = null;

beforeEach(() => {
  resolve.mockClear();
  shown.images = [];
  shown.unavailable = false;
  shown.items = [
    {
      id: '7',
      name: 'Photo.jpg',
      takenAt: 1,
      modificationTime: 10,
      width: 40,
      height: 30,
      durationMs: null,
      video: false,
    },
  ];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.unstubAllGlobals();
});

async function renderLocal(): Promise<void> {
  await act(async () => {
    root?.render(createElement(LocalViewer, { id: '7' }));
    await Promise.resolve();
  });
}

it('resolves a same-ID edit again and clears the previous decode failure with a fresh bitmap cache key', async () => {
  await renderLocal();
  const first = shown.images.at(-1);
  if (first === undefined) throw new Error('Expected the first local image');
  expect(first.source).toEqual({ uri: 'content://media/images/7', cacheKey: '7:10' });
  act(() => {
    first.onError({ error: 'old file could not decode' });
  });
  expect(shown.unavailable).toBe(true);
  shown.items = shown.items.map((item) => ({ ...item, modificationTime: 11 }));
  await renderLocal();
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(shown.unavailable).toBe(false);
  expect(shown.images.at(-1)?.source).toEqual({
    uri: 'content://media/images/7',
    cacheKey: '7:11',
  });
});
