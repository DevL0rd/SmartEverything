import type { ReactNode } from 'react';
import { CoreGrid } from '../../../components/charts';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { bucketLoads } from '../model/card-vitals';

const CPU_TOPICS = ['cpu'] as const;
const MOST_BARS = 32;
const HEIGHT = 28;

function Cores({ deviceId }: { readonly deviceId: string }): ReactNode {
  const cores = useComputerSelect(
    deviceId,
    (parts) => (parts.cpu === undefined ? null : bucketLoads(parts.cpu.cores, MOST_BARS)),
    sameJson,
  );
  return cores === null ? null : (
    <CoreGrid
      values={cores}
      groups={[{ label: 'Cores', from: 0, to: cores.length }]}
      height={HEIGHT}
      caption={false}
    />
  );
}

export function CoreStrip({ deviceId }: { readonly deviceId: string }): ReactNode {
  return (
    <DemandRegion deviceId={deviceId} topics={CPU_TOPICS} className="min-h-7">
      <Cores deviceId={deviceId} />
    </DemandRegion>
  );
}
