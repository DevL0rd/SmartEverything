import type { ReactNode } from 'react';
import { useActiveProfile, useBodyReadings } from '../../../store/people';
import type { Device } from '../../../store/state';
import { CompositionGrid, ScaleStatus } from '../../profiles';

function LatestComposition({ scale }: { readonly scale: Device }): ReactNode {
  const profile = useActiveProfile();
  const latest = useBodyReadings(profile?.id ?? null).find(
    (reading) => reading.device_id === scale.id,
  );
  const composition = latest?.composition ?? null;
  return composition === null ? null : <CompositionGrid composition={composition} />;
}

export function ScaleDetails({ scale }: { readonly scale: Device }): ReactNode {
  return (
    <>
      <LatestComposition scale={scale} />
      <ScaleStatus scale={scale} />
    </>
  );
}
