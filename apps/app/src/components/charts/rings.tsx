import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ColourRole } from '../../design/tokens';
import { percent } from '../../format/number';
import { Arc } from './arc';

interface Ring {
  readonly progress: number;
  readonly colour: ColourRole;
  readonly label: string;
}

export interface RingsProps {
  readonly rings: readonly Ring[];
  readonly size: number;
}

const GAP = 2;

function RingLayer({
  ring,
  size,
  thickness,
}: {
  readonly ring: Ring;
  readonly size: number;
  readonly thickness: number;
}): ReactNode {
  const progress = Math.max(0, ring.progress);
  const overlap = progress > 1 ? Math.min(1, progress - 1) : 0;
  const box = { width: size, height: size };
  return (
    <View pointerEvents="none" style={box} className="absolute">
      <View className={overlap > 0 ? 'opacity-60' : 'opacity-100'}>
        <Arc
          value={Math.min(1, progress)}
          size={size}
          thickness={thickness}
          colour={ring.colour}
          tinted
        />
      </View>
      {overlap > 0 ? (
        <View className="absolute inset-0">
          <Arc
            value={overlap}
            size={size}
            thickness={thickness}
            colour={ring.colour}
            trackColour={null}
          />
        </View>
      ) : null}
    </View>
  );
}

export function Rings({ rings, size }: RingsProps): ReactNode {
  const thickness = Math.max(6, Math.round(size / (rings.length * 3.2 + 1.5)));
  const box = { width: size, height: size };
  const label = rings.map((ring) => `${ring.label} ${percent(ring.progress)}`).join(', ');
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={box}
      className="items-center justify-center"
    >
      {rings.map((ring, index) => (
        <RingLayer
          key={ring.label}
          ring={ring}
          size={size - index * 2 * (thickness + GAP)}
          thickness={thickness}
        />
      ))}
    </View>
  );
}
