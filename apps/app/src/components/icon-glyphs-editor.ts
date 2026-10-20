import { NODE_GLYPHS } from './icon-glyphs-nodes';
import ListTreeGlyph from 'lucide-react-native/icons/list-tree';
import Redo2Glyph from 'lucide-react-native/icons/redo-2';
import SquareMousePointerGlyph from 'lucide-react-native/icons/square-mouse-pointer';
import WorkflowGlyph from 'lucide-react-native/icons/workflow';

export const EDITOR_GLYPHS = {
  ...NODE_GLYPHS,
  redo: Redo2Glyph,
  workflow: WorkflowGlyph,
  listTree: ListTreeGlyph,
  squareMousePointer: SquareMousePointerGlyph,
} as const;
