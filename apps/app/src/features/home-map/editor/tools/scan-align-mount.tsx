import { useMemo, useState, type ReactNode } from 'react';
import type { HomeMap, HomeMapOp, HomeMapScan } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import {
  scanPlacementOf,
  scanSourceOf,
  type ScanPlacementWire,
  type ScanSource,
} from '../../../../components/house-map/3d/map-3d-protocol';
import type { RenderBounds, RenderFloor } from '../../../../components/house-map/render-scene';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { HomeMap3dScan } from '../../components/stage/home-map-3d';
import { useShownScan } from '../../data/scan-link';
import { useScanUploads } from '../../data/scan-uploads-shared';
import {
  ScanAlignPanel,
  scanAlignEdit,
  scanAlignNotice,
  scanAlignOverlay,
  useScanAlign,
} from './scan-align';
import {
  NO_EDIT_FIELDS,
  type EditCommit,
  type MountArgs,
  type MountEditFields,
} from '../mount-edit';

const log = new Logger('app.home-map');

export interface ScanAlignMountInput {
  readonly map: HomeMap;
  readonly floor: RenderFloor | undefined;
  readonly readOnly: boolean;
  readonly edit: (ops: readonly HomeMapOp[]) => Promise<unknown>;
  readonly commit: EditCommit;
}

export interface ScanAlignRealistic extends HomeMap3dScan {
  readonly onExtent: (bounds: RenderBounds | null) => void;
}

export interface ScanAlignMount extends MountEditFields {
  readonly panel: ReactNode;
  readonly realistic: ScanAlignRealistic | null;
}

export type MountScanAlign = (args: MountArgs) => ScanAlignMount;

interface Measured {
  readonly key: string;
  readonly bounds: RenderBounds | null;
}

function useScanSource(map: HomeMap): ScanSource | null {
  const shown = useShownScan(map.id, map.scan ?? null);
  const found = scanSourceOf(map.id, shown.scan, shown.urlOf);
  const key = found?.key ?? null;
  const url = found?.url ?? null;
  const format = found?.format ?? null;
  return useMemo(
    () => (key === null || url === null || format === null ? null : { key, url, format }),
    [key, url, format],
  );
}

function usePlacement(scan: HomeMapScan | null, opacity: number | null): ScanPlacementWire | null {
  return useMemo(() => {
    if (scan === null) return null;
    const placement = scanPlacementOf(scan);
    return opacity === null ? placement : { ...placement, opacity };
  }, [scan, opacity]);
}

function useMeasured(key: string | null): {
  readonly bounds: RenderBounds | null;
  readonly onExtent: (bounds: RenderBounds | null) => void;
} {
  const [measured, setMeasured] = useState<Measured | null>(null);
  const onExtent = useStableCallback((bounds: RenderBounds | null): void => {
    if (key !== null) setMeasured({ key, bounds });
  });
  return { bounds: measured?.key === key ? measured.bounds : null, onExtent };
}

export function useScanAlignMount(input: ScanAlignMountInput): MountScanAlign {
  const uploads = useScanUploads();
  const source = useScanSource(input.map);
  const measured = useMeasured(source?.key ?? null);
  const onFailed = useStableCallback((detail: string): void => {
    log.warn('home_map.scan_align_load_failed', { key: source?.key ?? null, detail });
  });
  const align = useScanAlign({
    ...{ map: input.map, floor: input.floor, readOnly: input.readOnly },
    ...{ uploads, measured: measured.bounds, commit: input.commit },
    edit: (ops): void => {
      background(input.edit(ops), 'home_map.scan_align_edit_failed');
    },
  });
  const placement = usePlacement(align.scan, align.opacity);
  return () => ({
    ...NO_EDIT_FIELDS,
    overlay: scanAlignOverlay(align),
    onEdit: (event): void => {
      scanAlignEdit(align, event);
    },
    notice: scanAlignNotice(align),
    panel: <ScanAlignPanel align={align} />,
    realistic:
      align.scan === null
        ? null
        : { source, placement, retrySeq: 0, onFailed, onExtent: measured.onExtent },
  });
}
