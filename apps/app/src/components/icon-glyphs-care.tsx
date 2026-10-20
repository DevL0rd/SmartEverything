import type { LucideProps } from 'lucide-react-native';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';

const TOOTHBRUSH_PATHS: readonly string[] = [
  'M4 20l9.2-9.2',
  'M11.6 9.2l3.2 3.2 3.4-3.4-3.2-3.2z',
  'M15.2 4.4l1.2-1.2',
  'M18.4 7.6l1.2-1.2',
];

function ToothbrushGlyph({
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
      {TOOTHBRUSH_PATHS.map((path) => (
        <Path key={path} d={path} />
      ))}
    </Svg>
  );
}

export const CARE_GLYPHS = { toothbrush: ToothbrushGlyph } as const;
