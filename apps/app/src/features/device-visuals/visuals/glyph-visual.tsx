import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { View } from 'react-native';
import { Circle } from 'react-native-svg';
import { Icon, type IconName } from '../../../components/icon';
import { useColour } from '../../../design/colour';
import { Canvas } from '../parts/frame';
import { tintRole } from '../parts/ink';
import type { VisualComponent, VisualProps } from '../types';

const GLYPH_PX = 40;

function GlyphVisual({ icon, px, tone }: VisualProps & { readonly icon: IconName }): ReactNode {
  const fill = useColour(tone === 'active' ? 'primary-container' : 'surface-2');
  const edge = useColour('outline-variant');
  const centre: ViewStyle = {
    position: 'absolute',
    left: px / 2 - GLYPH_PX / 2,
    top: px / 2 - GLYPH_PX / 2,
    transform: [{ scale: (px * 0.34) / GLYPH_PX }],
  };
  return (
    <>
      <Canvas px={px}>
        <Circle cx={50} cy={50} r={40} fill={fill} stroke={edge} strokeWidth={1} />
      </Canvas>
      <View style={centre}>
        <Icon name={icon} size={GLYPH_PX} colour={tintRole('primary', tone)} />
      </View>
    </>
  );
}

export function glyphVisual(icon: IconName): VisualComponent {
  return function FamilyGlyph(props: VisualProps): ReactNode {
    return <GlyphVisual {...props} icon={icon} />;
  };
}
