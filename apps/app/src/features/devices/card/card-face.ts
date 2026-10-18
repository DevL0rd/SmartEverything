import type { ReactNode } from 'react';
import type { FrameClass, WidgetFrameBox, WidgetSize } from '../../../components/widget-board';
import type { Device } from '../../../store/state';

export interface CardFaceProps {
  readonly device: Device;
  readonly cls: FrameClass;
  readonly frame: WidgetFrameBox;
  readonly size: WidgetSize;
}

export type CardFace = (props: CardFaceProps) => ReactNode;
