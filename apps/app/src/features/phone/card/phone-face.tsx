import type { ReactNode } from 'react';
import type { FrameClass } from '../../../components/widget-board';
import type { Device } from '../../../store/state';
import { LargeFace } from './large-face';
import { MediumFace } from './small-faces';
import { usePhoneFace } from './use-phone-face';
import { WideFace } from './wide-face';

export function PhoneFace({
  device,
  cls,
}: {
  readonly device: Device;
  readonly cls: FrameClass;
}): ReactNode {
  const data = usePhoneFace(device);
  switch (cls) {
    case 'w':
      return <WideFace data={data} />;
    case 'l':
    case 'xl':
      return <LargeFace data={data} tall={cls === 'xl'} />;
    case 's':
    case 'xs':
    case 'm':
      return <MediumFace data={data} />;
  }
}
