import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { faceLabel, type Face } from '../model/face-model';
import { sizeStyle } from './style';

const STAR = 'M0 -3.4L1 -1.1L3.4 -0.9L1.6 0.8L2.1 3.2L0 2L-2.1 3.2L-1.6 0.8L-3.4 -0.9L-1 -1.1Z';

const STAR_AT: readonly (readonly [number, number])[] = [
  [31, 8],
  [36, 15],
  [31, 22],
];

export function ResultFace({
  face,
  size,
}: {
  readonly face: Face | null;
  readonly size: number;
}): ReactNode {
  const ink = useColour('on-surface');
  const accent = useColour('warning');
  const plate = useColour('surface-3');
  if (face === null || face.kind === 'none') {
    return null;
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={faceLabel(face)}
      style={sizeStyle(size, size)}
    >
      <Svg width={size} height={size} viewBox="0 0 40 30">
        <Circle cx={15} cy={15} r={12.5} fill={plate} stroke={ink} strokeWidth={1.4} />
        <Circle cx={10.8} cy={12.2} r={1.5} fill={ink} />
        <Circle cx={19.2} cy={12.2} r={1.5} fill={ink} />
        <Path
          d={face.kind === 'smile' ? 'M9.6 18.2Q15 23.6 20.4 18.2' : 'M10.4 19.6H19.6'}
          fill="none"
          stroke={ink}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        {STAR_AT.slice(0, face.stars).map(([x, y]) => (
          <Path
            key={`${String(x)}-${String(y)}`}
            d={STAR}
            transform={`translate(${String(x)} ${String(y)})`}
            fill={accent}
          />
        ))}
      </Svg>
    </View>
  );
}
