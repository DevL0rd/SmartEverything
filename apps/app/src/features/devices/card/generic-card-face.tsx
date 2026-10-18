import type { ReactNode } from 'react';
import type { CardFaceProps } from './card-face';
import { GENERIC_FACES } from './card-faces';

export function GenericCardFace({ device, cls, frame, size }: CardFaceProps): ReactNode {
  const Face = GENERIC_FACES[cls];
  return <Face device={device} box={frame} size={size} />;
}
