import type { ReactNode } from 'react';
import { LightCard, LightHeroCard, LightPanel, LightTile, LightWide } from '../faces/light-cards';
import type { CardFaceProps } from './card-face';

export function LightCardFace({ device, cls }: CardFaceProps): ReactNode {
  switch (cls) {
    case 's':
    case 'xs':
      return <LightTile device={device} />;
    case 'm':
      return <LightCard device={device} />;
    case 'l':
      return <LightPanel device={device} />;
    case 'w':
      return <LightWide device={device} />;
    case 'xl':
      return <LightHeroCard device={device} />;
  }
}
