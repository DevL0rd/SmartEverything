import { useThemeSetting } from '../../design/theme';
import { SEMANTIC_SIZES, type SemanticSizes } from '../../design/tokens';
import { frameClassOf, type FrameClass, type WidgetFrameBox } from './frame-class';
import { useWidgetFrame } from './widget-scope';

export interface WidgetFace {
  readonly frame: WidgetFrameBox;
  readonly cls: FrameClass;
  readonly sizes: SemanticSizes;
}

class WidgetFrameMissingError extends Error {
  override readonly name = 'WidgetFrameMissingError';
}

export function useWidgetFace(): WidgetFace {
  const frame = useWidgetFrame();
  const density = useThemeSetting('density');
  if (frame === null) {
    throw new WidgetFrameMissingError('A widget face must render inside a board widget frame.');
  }
  return {
    frame,
    cls: frameClassOf(frame),
    sizes: SEMANTIC_SIZES[frame.idiom][density],
  };
}
