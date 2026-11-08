import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ focused: true, foreground: true, visible: true }));
const prefetch = vi.hoisted(() => vi.fn((): Promise<boolean> => Promise.resolve(true)));
const release = vi.hoisted(() => vi.fn());
const load = vi.hoisted(() =>
  vi.fn((): Promise<{ release: typeof release }> => Promise.resolve({ release })),
);
const links = vi.hoisted(() => vi.fn((id: string): string => `https://hub.test/${id}?signature=1`));
const platform = vi.hoisted(() => ({ native: false }));

vi.mock('../../../design/animation-gate', () => ({ useScreenLive: (): typeof state => state }));
vi.mock('../../../design/visibility', () => ({ useScopeVisible: (): boolean => state.visible }));
vi.mock('../../nas/data/links', () => ({ useDriveLink: links }));
vi.mock('../local/store', () => ({
  localIdOf: (tile: { local: boolean }): string | null => (tile.local ? 'local' : null),
}));
vi.mock('../../../components/media-grid/tile', () => ({
  tileKey: (tile: { id: string; rev: number }): string => `${tile.id}:${String(tile.rev)}`,
}));
vi.mock('../../../design/platform', () => ({ isNative: (): boolean => platform.native }));
vi.mock('expo-image', () => ({ Image: { prefetch, loadAsync: load } }));

const { ThumbnailWarmup, warmThumbnail } = await import('./thumbnail-warmup');
const { fixtureTiles } = await import('../../../components/media-grid/fixtures');
const { photoFlags } = await import('@smarteverything/domain');
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.focused = true;
  state.foreground = true;
  state.visible = true;
  platform.native = false;
  prefetch.mockClear();
  load.mockClear();
  release.mockClear();
  links.mockClear();
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
    root.unmount();
  });
  vi.unstubAllGlobals();
});

async function render(tiles = fixtureTiles(1)): Promise<void> {
  await act(async () => {
    root.render(createElement(ThumbnailWarmup, { tiles }));
    await Promise.resolve();
  });
}

describe('timeline thumbnail warming', () => {
  it('warms the exact browser URL for images and remote video posters', async () => {
    const tiles = fixtureTiles(2).map((tile, index) => ({
      ...tile,
      flags: photoFlags(index ? ['video'] : []),
    }));
    await render(tiles);
    expect(prefetch.mock.calls).toEqual(
      tiles.map((tile) => [`https://hub.test/${tile.id}?signature=1`, 'disk']),
    );
  });

  it('warms native thumbnails under the exact rendered cache key and releases decoded refs', async () => {
    platform.native = true;
    await warmThumbnail('https://hub.test/thumb?sig=1', 'item:7');
    expect(load).toHaveBeenCalledWith({ uri: 'https://hub.test/thumb?sig=1', cacheKey: 'item:7' });
    expect(release).toHaveBeenCalledTimes(1);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('does not restart overlapping loads when the lookahead moves or rerenders', async () => {
    const tiles = fixtureTiles(3);
    await render(tiles.slice(0, 2));
    await render(tiles.slice(1));
    await render(tiles.slice(1).map((tile) => ({ ...tile })));
    expect(prefetch).toHaveBeenCalledTimes(3);
  });

  it('starts no work on background, lost focus or hidden scope', async () => {
    state.foreground = false;
    await render();
    state.foreground = true;
    state.focused = false;
    await render();
    state.focused = true;
    state.visible = false;
    await render();
    expect(links).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it('never decodes local videos or requests processing and unreadable files', async () => {
    await render(
      fixtureTiles(3).map((tile, index) => ({
        ...tile,
        local: index === 0,
        flags: photoFlags(index === 1 ? ['processing'] : index === 2 ? ['unreadable'] : ['video']),
      })),
    );
    expect(links).not.toHaveBeenCalled();
    expect(prefetch).not.toHaveBeenCalled();
  });
});
