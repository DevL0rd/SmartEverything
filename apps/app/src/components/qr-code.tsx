import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { qrDrawingOf } from './qr-path';

export interface QrCodeProps {
  readonly text: string;
  readonly size: number;
  readonly label: string;
}

const INK = 'black';

export function QrCode({ text, size, label }: QrCodeProps): ReactNode {
  const drawing = qrDrawingOf(text);
  const box = `0 0 ${String(drawing.size)} ${String(drawing.size)}`;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="self-center overflow-hidden rounded-md bg-white"
    >
      <Svg width={size} height={size} viewBox={box}>
        <Path d={drawing.path} fill={INK} />
      </Svg>
    </View>
  );
}
