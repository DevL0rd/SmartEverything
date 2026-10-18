import type { LucideProps } from 'lucide-react-native';
import BrushGlyph from 'lucide-react-native/icons/brush';
import EraserGlyph from 'lucide-react-native/icons/eraser';
import ListCheckGlyph from 'lucide-react-native/icons/list-check';
import PointerGlyph from 'lucide-react-native/icons/pointer';
import ShieldAlertGlyph from 'lucide-react-native/icons/shield-alert';
import ShieldCheckGlyph from 'lucide-react-native/icons/shield-check';
import ShieldXGlyph from 'lucide-react-native/icons/shield-x';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';

const SHIELD_PATH =
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';
const PENCIL_PATH = 'M9.5 15.5l.6-2.1 4.3-4.3a1.06 1.06 0 0 1 1.5 1.5l-4.3 4.3z';

function PencilShieldGlyph({
  size = 24,
  color = 'currentColor',
  strokeWidth = 2,
}: LucideProps): ReactNode {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={SHIELD_PATH} />
      <Path d={PENCIL_PATH} />
    </Svg>
  );
}

export const ACCESS_GLYPHS = {
  shieldAlert: ShieldAlertGlyph,
  shieldCheck: ShieldCheckGlyph,
  shieldX: ShieldXGlyph,
  pencilShield: PencilShieldGlyph,
  listCheck: ListCheckGlyph,
  brush: BrushGlyph,
  eraser: EraserGlyph,
  pointer: PointerGlyph,
} as const;
