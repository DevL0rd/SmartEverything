import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { HomeMap } from '@smarteverything/domain';
import {
  scanPlacementOf,
  scanSourceOf,
  type ScanSource,
} from '../../../../components/house-map/3d/map-3d-protocol';
import { useStableCallback } from '../../../../design/use-stable-callback';
import { useSyncStatus } from '../../../../store/selectors';
import { useShownScan } from '../../data/scan-link';
import { useScanUploads } from '../../data/scan-uploads-shared';
import { HomeMap3d, type HeroRealisticInput } from './home-map-3d';
import { RealisticState } from './realistic-states';

interface ScanFailure {
  readonly key: string;
  readonly detail: string;
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

function useScanFailure(source: ScanSource | null): {
  readonly failed: string | null;
  readonly report: (detail: string) => void;
  readonly retrySeq: number;
  readonly retry: () => void;
} {
  const [failure, setFailure] = useState<ScanFailure | null>(null);
  const [retrySeq, setRetrySeq] = useState(0);
  const key = source?.key ?? null;
  const report = useStableCallback((detail: string): void => {
    if (key !== null) setFailure({ key, detail });
  });
  const retry = (): void => {
    setFailure(null);
    setRetrySeq((seq) => seq + 1);
  };
  const failed = failure !== null && failure.key === key ? failure.detail : null;
  return { failed, report, retrySeq, retry };
}

interface FallbackProps {
  readonly onReady: () => void;
  readonly onShown: () => void;
  readonly children: ReactNode;
}

function Fallback({ onReady, onShown, children }: FallbackProps): ReactNode {
  useEffect(onShown, [onShown]);
  return (
    <View className="absolute inset-0" onLayout={onReady}>
      {children}
    </View>
  );
}

function RealisticMap({ map, map3d }: HeroRealisticInput): ReactNode {
  const uploads = useScanUploads();
  const offline = useSyncStatus().status !== 'live';
  const source = useScanSource(map);
  const scan = map.scan ?? null;
  const placement = useMemo(() => (scan === null ? null : scanPlacementOf(scan)), [scan]);
  const failure = useScanFailure(source);
  const [webgl2, setWebgl2] = useState(true);
  const unsupported = useStableCallback((): void => {
    setWebgl2(false);
  });
  return (
    <View className="absolute inset-0">
      <HomeMap3d
        {...map3d}
        look={{ ...map3d.look, showFurniture: false }}
        realistic={{
          source,
          placement,
          retrySeq: failure.retrySeq,
          onFailed: failure.report,
        }}
        fallback={
          <Fallback onReady={map3d.live.onReady} onShown={unsupported}>
            {map3d.fallback}
          </Fallback>
        }
      />
      <RealisticState
        uploads={uploads}
        mapId={map.id}
        mapName={map.name}
        insets={map3d.insets}
        scan={scan === null ? 'none' : 'present'}
        webgl2={webgl2}
        linked={source !== null}
        loadFailed={failure.failed}
        offline={offline}
        onReload={failure.retry}
      />
    </View>
  );
}

export function homeMapRealistic({ map, map3d }: HeroRealisticInput): ReactNode {
  return <RealisticMap map={map} map3d={map3d} />;
}
