import { widgetBodyHeight, type FrameClass } from '../../../components/widget-board';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import type { BodyBox } from './climate-fit';

export interface ClimateBody {
  readonly box: BodyBox;
  readonly cls: FrameClass;
}

export function useClimateBody(): ClimateBody {
  const { frame, cls } = useWidgetFace();
  return {
    box: { width: frame.width, height: widgetBodyHeight(frame), idiom: frame.idiom },
    cls,
  };
}
