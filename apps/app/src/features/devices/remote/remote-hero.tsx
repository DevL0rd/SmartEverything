import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import type { Device } from '../../../store/state';
import { RemoteFace } from './remote-face';
import { useLibrarySource } from './remote-source';

export function RemoteHero({ device }: { readonly device: Device }): ReactNode {
  return (
    <Card>
      <RemoteFace source={useLibrarySource(device)} cls="l" />
    </Card>
  );
}
