import type { ReactNode } from 'react';
import Svg, { G, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { countriesIn, type CountryShape } from './countries';
import { viewBoxText, type FrameSize, type MapBox } from './projection';

const BORDER_WIDTH = 0.6;

export interface WorldBaseProps {
  readonly view: MapBox;
  readonly frame: FrameSize;
  readonly shades?: ReadonlyMap<string, number> | undefined;
}

interface CountryColours {
  readonly land: string;
  readonly visited: string;
  readonly border: string;
}

function Country({
  shape,
  shade,
  colours,
}: {
  readonly shape: CountryShape;
  readonly shade: number | undefined;
  readonly colours: CountryColours;
}): ReactNode {
  return (
    <G>
      <Path
        d={shape.d}
        fill={colours.land}
        fillRule="evenodd"
        stroke={colours.border}
        strokeWidth={BORDER_WIDTH}
        vectorEffect="non-scaling-stroke"
      />
      {shade === undefined ? null : (
        <Path d={shape.d} fill={colours.visited} fillOpacity={shade} fillRule="evenodd" />
      )}
    </G>
  );
}

export function WorldBase({ view, frame, shades }: WorldBaseProps): ReactNode {
  const land = useColour('surface-3');
  const visited = useColour('viz-1');
  const border = useColour('outline');
  const colours: CountryColours = { land, visited, border };
  return (
    <Svg width={frame.width} height={frame.height} viewBox={viewBoxText(view)}>
      {countriesIn(view).map((shape) => (
        <Country key={shape.code} shape={shape} shade={shades?.get(shape.code)} colours={colours} />
      ))}
    </Svg>
  );
}
