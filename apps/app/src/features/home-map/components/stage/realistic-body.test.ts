import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Map<string, Props>());
const link = vi.hoisted((): { url: string | null } => ({ url: 'https://hub.test/scan' }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.set(kind, props);
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('./home-map-3d', () => ({ HomeMap3d: stub('HomeMap3d') }));
vi.mock('./realistic-states', () => ({ RealisticState: stub('RealisticState') }));
vi.mock('../../data/scan-uploads-shared', () => ({ useScanUploads: (): string => 'uploads' }));
vi.mock('../../../../store/selectors', () => ({
  useSyncStatus: (): { status: string } => ({ status: 'live' }),
}));
vi.mock('../../data/scan-link', () => ({
  useShownScan: (_mapId: string, scan: unknown): { scan: unknown; urlOf: () => string } => ({
    scan: link.url === null ? null : scan,
    urlOf: (): string => link.url ?? '',
  }),
}));

const { homeMapRealistic } = await import('./realistic-body');

const SCAN = {
  opacity: 0.8,
  residualM: null,
  uploadedAt: '2026-11-02T10:00:00.000Z',
  uploadedBy: 'owner',
  file: { hash: 'a'.repeat(64), format: 'spz', bytes: 10, name: 'home.spz' },
  lod: null,
  transform: { tx: 1, ty: 2, tz: 0, yawDeg: 15, scale: 1, levelled: true },
  points: [],
} as const;

const LOOK = { showFurniture: true, showDeviceModels: true, lightUp: true };

function draw(scan: typeof SCAN | undefined): void {
  seen.clear();
  const map3d = { look: LOOK, live: { onReady: vi.fn() }, fallback: null, realistic: null };
  const map = { id: 'home', name: 'Home', ...(scan === undefined ? {} : { scan }) };
  const body = (): ReactElement | null => {
    const out: unknown = Reflect.apply(homeMapRealistic, undefined, [{ map, map3d }]);
    return isValidElement(out) ? out : null;
  };
  renderToStaticMarkup(createElement(body));
}

describe('homeMapRealistic', () => {
  it('loads the linked scan into the 3D map with its placement and hides the furniture models', () => {
    link.url = 'https://hub.test/scan';
    draw(SCAN);
    const map3d = seen.get('HomeMap3d');
    expect(map3d?.['look']).toMatchObject({ showFurniture: false, showDeviceModels: true });
    expect(map3d?.['realistic']).toMatchObject({
      source: { key: `home:original:${'a'.repeat(64)}`, url: link.url, format: 'spz' },
      placement: { tx: 1, ty: 2, tz: 0, yawDeg: 15, scale: 1, opacity: 0.8 },
      retrySeq: 0,
    });
    expect(seen.get('RealisticState')).toMatchObject({
      scan: 'present',
      linked: true,
      loadFailed: null,
      webgl2: true,
    });
  });

  it('shows the processing state until the scan link arrives', () => {
    link.url = null;
    draw(SCAN);
    expect(seen.get('HomeMap3d')?.['realistic']).toMatchObject({ source: null });
    expect(seen.get('RealisticState')).toMatchObject({ scan: 'present', linked: false });
  });

  it('asks for a scan on a map without one', () => {
    link.url = 'https://hub.test/scan';
    draw(undefined);
    expect(seen.get('RealisticState')).toMatchObject({ scan: 'none', linked: false });
  });
});
