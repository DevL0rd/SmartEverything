import type {
  BoardClass,
  FrameClass,
  WidgetFrameBox,
  WidgetSize,
} from '../../../components/widget-board';

export type InternetFace = 'tile' | 'compact' | 'tall' | 'wide';

export type PeopleFace = 'stack' | 'chips' | 'rows';

export function internetFaceOf(cls: FrameClass): InternetFace {
  switch (cls) {
    case 's':
      return 'tile';
    case 'xs':
    case 'm':
      return 'compact';
    case 'l':
      return 'tall';
    case 'w':
    case 'xl':
      return 'wide';
  }
}

export function peopleFaceOf(cls: FrameClass): PeopleFace {
  switch (cls) {
    case 's':
      return 'stack';
    case 'xs':
    case 'm':
    case 'w':
      return 'chips';
    case 'l':
    case 'xl':
      return 'rows';
  }
}

export const INTERNET_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'W', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

export const PEOPLE_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'XL'],
  expanded: ['M', 'XL'],
};

const HEADER_TOUCH = 40;
const HEADER_POINTER = 32;
const BODY_GAP = 12;

export function bodyHeightOf(frame: WidgetFrameBox): number {
  const header = frame.idiom === 'touch' ? HEADER_TOUCH : HEADER_POINTER;
  return Math.max(0, frame.height - header - BODY_GAP);
}
