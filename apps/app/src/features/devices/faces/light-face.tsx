import type { ReactNode } from 'react';
import type { Device } from '../../../store/state';
import { StandaloneShell } from '../card/standalone-shell';
import type { FaceName, FaceProps } from './face-types';
import { LightCard, LightPanel, LightTile } from './light-cards';
import { LightChip } from './light-chip';
import { LightRow } from './light-row';

function Card({ device, face }: { readonly device: Device; readonly face: FaceName }): ReactNode {
  if (face === 'tile') {
    return <LightTile device={device} />;
  }
  return face === 'card' ? <LightCard device={device} /> : <LightPanel device={device} />;
}

export function LightFaceOf({
  device,
  face,
  context,
  onToggleExpand,
}: Omit<FaceProps, 'deviceId'> & { readonly device: Device }): ReactNode {
  if (face === 'chip') {
    return <LightChip device={device} />;
  }
  if (face === 'row' || face === 'row-expanded') {
    return (
      <LightRow
        device={device}
        expanded={face === 'row-expanded'}
        onToggleExpand={onToggleExpand}
      />
    );
  }
  if (context === 'nested') {
    return <Card device={device} face={face} />;
  }
  return (
    <StandaloneShell device={device} editing={false} quickControls={face === 'tile'} padded>
      <Card device={device} face={face} />
    </StandaloneShell>
  );
}
