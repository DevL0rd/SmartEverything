import type { LucideProps } from 'lucide-react-native';
import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';

const BULB_GROUP_PATHS: readonly string[] = [
  'M9 15.5c-1.7-1-3-2.8-3-5a5 5 0 1 1 10 0c0 2.2-1.3 4-3 5v1.5H9z',
  'M9.5 20h5',
  'M18.5 7.5a3.2 3.2 0 0 1 2.5 3.1c0 1.3-.7 2.4-1.7 3',
  'M3.5 7.5A3.2 3.2 0 0 0 1 10.6c0 1.3.7 2.4 1.7 3',
];

function BulbGroupGlyph({
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
      {BULB_GROUP_PATHS.map((path) => (
        <Path key={path} d={path} />
      ))}
    </Svg>
  );
}

export const LIGHT_GLYPHS = { bulbGroup: BulbGroupGlyph } as const;
