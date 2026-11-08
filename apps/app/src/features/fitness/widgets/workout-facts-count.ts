import type { WidgetFrameBox } from '../../../components/widget-board/frame-class';
import { widgetBodyHeight } from '../../../components/widget-board/widget-frame-metrics';
import { TYPE_SCALE } from '../../../design/tokens';

const FACT_MIN_WIDTH = 72;
const FACT_GAP = 16;
const STACK_GAP = 6;
const WELL = 36;

export interface WorkoutFactGrid {
  readonly columns: number;
  readonly rows: number;
}

export function workoutFactGrid(frame: WidgetFrameBox): WorkoutFactGrid {
  const type = TYPE_SCALE[frame.idiom];
  const header = Math.max(WELL, type['title-3'][1] + type.footnote[1]);
  const fact = type.caption[1] + type.callout[1];
  const room = widgetBodyHeight(frame) - header;
  return {
    columns: Math.max(1, Math.floor((frame.width + FACT_GAP) / (FACT_MIN_WIDTH + FACT_GAP))),
    rows: Math.max(0, Math.floor(room / (fact + STACK_GAP))),
  };
}
