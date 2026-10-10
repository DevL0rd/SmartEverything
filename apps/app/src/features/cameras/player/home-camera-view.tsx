import type { ReactNode } from 'react';
import { useCameraEntry } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { PlayerStage } from './player-stage';
import { useLiveSession } from './use-live-session';

function LiveView({ entry }: { readonly entry: CameraEntry }): ReactNode {
  const live = useLiveSession(entry, { enabled: true, answering: false });
  return <PlayerStage entry={entry} live={live} compact />;
}

export function HomeCameraView({ cameraId }: { readonly cameraId: string }): ReactNode {
  const entry = useCameraEntry(cameraId);
  return entry === null ? null : <LiveView entry={entry} />;
}
