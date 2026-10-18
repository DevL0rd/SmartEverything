import type { ReactNode } from 'react';
import type { FrameClass } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect, useComputerStatus } from '../data/computer-metrics';
import type { ComputerStatus } from '../model/computer-view';
import { FaceSkeleton } from './face-skeleton';
import { LargeFace } from './large-face';
import { CardFace, ExtraSmallFace, TileFace } from './small-faces';
import { WideFace } from './wide-face';

const SUMMARY = ['summary'] as const;
const TALL = 'xl';

interface FaceProps {
  readonly device: Device;
  readonly status: ComputerStatus;
}

function FaceOf({ cls, ...face }: FaceProps & { readonly cls: FrameClass }): ReactNode {
  switch (cls) {
    case 's':
      return <TileFace {...face} />;
    case 'xs':
      return <ExtraSmallFace {...face} />;
    case 'm':
      return <CardFace {...face} />;
    case 'w':
      return <WideFace {...face} />;
    case 'l':
    case 'xl':
      return <LargeFace {...face} tall={cls === TALL} />;
  }
}

function FaceBody({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: FrameClass;
}): ReactNode {
  const status = useComputerStatus(device);
  const loaded = useComputerSelect(device.id, (parts) => parts.summary !== undefined);
  if (!loaded && device.online) return <FaceSkeleton cls={cls} />;
  return <FaceOf device={device} status={status} cls={cls} />;
}

export function ComputerFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: FrameClass;
}): ReactNode {
  return (
    <DemandRegion
      deviceId={device.id}
      topics={SUMMARY}
      history={device}
      backfill={SUMMARY}
      className="flex-1"
    >
      <FaceBody device={device} cls={cls} />
    </DemandRegion>
  );
}
