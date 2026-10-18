import type { ReactNode } from 'react';
import { FamilyVisual, visualStateOf, type VisualPx, type VisualState } from '../../device-visuals';
import type { RemoteSource } from './remote-source';

export interface RemoteLook {
  readonly on: boolean | null;
  readonly assumed: boolean;
  readonly failed: boolean;
  readonly sentAt: string | null;
}

function remoteVisualState(source: RemoteSource, look: RemoteLook): VisualState {
  return {
    ...visualStateOf(source.host, {}),
    online: source.online,
    power: look.on === true ? 'on' : 'off',
    ir: {
      category: source.category,
      on: look.on,
      assumed: look.assumed,
      failed: look.failed,
      sentAt: look.sentAt,
    },
  };
}

export function RemoteVisual({
  source,
  look,
  px,
}: {
  readonly source: RemoteSource;
  readonly look: RemoteLook;
  readonly px: VisualPx;
}): ReactNode {
  return (
    <FamilyVisual family="ir_remote" state={remoteVisualState(source, look)} size="card" px={px} />
  );
}
