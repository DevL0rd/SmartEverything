import type { ReactNode } from 'react';
import type { CardFaceProps } from './card-face';
import { GenericFace } from './card-faces';

export function GenericCardFace({ device, cls }: CardFaceProps): ReactNode {
  return <GenericFace device={device} cls={cls} />;
}
