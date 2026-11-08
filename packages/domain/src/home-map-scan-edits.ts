import type { HomeMap } from './home-map';
import type { HomeMapConflictReason, HomeMapOp } from './home-map-edit-ops';
import { HOME_MAP_SCAN_PATCH, HOME_MAP_SCAN_WRITE, type HomeMapScan } from './home-map-scan';

export interface ScanDone {
  readonly map: HomeMap;
  readonly inverse: readonly HomeMapOp[];
}

export interface ScanRefused {
  readonly refused: HomeMapConflictReason;
  readonly kind: string | null;
  readonly id: string | null;
}

type OpOf<Name extends HomeMapOp['op']> = Extract<HomeMapOp, { op: Name }>;

const refuse = (refused: HomeMapConflictReason): ScanRefused => ({
  refused,
  kind: 'scan',
  id: null,
});

const restoreOps = (scan: HomeMapScan | undefined): readonly HomeMapOp[] =>
  scan === undefined ? [{ op: 'removeScan' }] : [{ op: 'setScan', scan }];

export function setScan(map: HomeMap, op: OpOf<'setScan'>): ScanDone | ScanRefused {
  const parsed = HOME_MAP_SCAN_WRITE.safeParse(op.scan);
  if (!parsed.success) return refuse('invalid');
  return { map: { ...map, scan: parsed.data }, inverse: restoreOps(map.scan) };
}

export function removeScan(map: HomeMap): ScanDone | ScanRefused {
  const { scan, ...rest } = map;
  if (scan === undefined) return refuse('missing_element');
  return { map: rest, inverse: restoreOps(scan) };
}

export function setScanTransform(
  map: HomeMap,
  op: OpOf<'setScanTransform'>,
): ScanDone | ScanRefused {
  const before = map.scan;
  if (before === undefined) return refuse('missing_element');
  const checked = HOME_MAP_SCAN_PATCH.safeParse(op.patch);
  if (!checked.success) return refuse('invalid');
  const { transform, ...rest } = checked.data;
  const merged = HOME_MAP_SCAN_WRITE.safeParse({
    ...before,
    ...rest,
    transform: { ...before.transform, ...transform },
  });
  if (!merged.success) return refuse('invalid');
  const restore = Object.fromEntries(
    Object.keys(checked.data).map((key) => [key, Reflect.get(before, key)]),
  );
  return {
    map: { ...map, scan: merged.data },
    inverse: [{ op: 'setScanTransform', patch: restore }],
  };
}
