import type { BrushMode } from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

const NOT_THIS_BRUSH: ColourRole = 'on-surface-variant';

export function colourFrom(
  table: Readonly<Partial<Record<BrushMode, ColourRole>>>,
): (mode: BrushMode) => ColourRole {
  return (mode) => table[mode] ?? NOT_THIS_BRUSH;
}
