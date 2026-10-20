import type { ReactNode } from 'react';
import { LoadedQuery } from '../../components/loaded-query';
import type { Device } from '../../store/state';
import { brandUi } from './brands';
import { useBrushDemand, useBrushState } from './data/brush-data';

export function BrushQuick({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  useBrushDemand(device.id);
  return (
    <LoadedQuery query={state}>
      {(view) => {
        const { HandleStrip } = brandUi(view.profile.brand);
        return HandleStrip === null ? null : <HandleStrip deviceId={device.id} view={view} />;
      }}
    </LoadedQuery>
  );
}
