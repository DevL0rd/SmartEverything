import { weatherKindOf, type WeatherKind } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { View } from 'react-native';
import { useColour } from '../../../design/colour';
import {
  SIZE_CLASS,
  useAnimationGate,
  useOnScreen,
  type Box,
  type VisualPx,
} from '../../device-visuals';
import { Bolt, Drops, Mist, Twinkle, type Shower } from './fall';
import { Cloud, Moon, Sun } from './sky';

interface Palette {
  readonly sun: string;
  readonly moon: string;
  readonly cloud: string;
  readonly heavy: string;
  readonly shade: string;
  readonly rain: string;
  readonly snow: string;
  readonly bolt: string;
}

function usePalette(): Palette {
  return {
    sun: useColour('temp-warm'),
    moon: useColour('viz-3'),
    cloud: useColour('on-surface-faint'),
    heavy: useColour('on-surface-variant'),
    shade: useColour('on-surface'),
    rain: useColour('humidity'),
    snow: useColour('on-surface-variant'),
    bolt: useColour('warning'),
  };
}

interface SceneProps {
  readonly px: number;
  readonly day: boolean;
  readonly heavy: boolean;
  readonly moving: boolean;
  readonly palette: Palette;
}

const HIGH_CLOUD: Box = { x: 14, y: 12, w: 70, h: 44 };
const UNDER_CLOUD: Box = { x: 24, y: 52, w: 52, h: 38 };

function Light({ px, day, moving, palette, box }: SceneProps & { readonly box: Box }): ReactNode {
  return day ? (
    <Sun box={box} px={px} colour={palette.sun} moving={moving} />
  ) : (
    <Moon box={box} px={px} colour={palette.moon} moving={moving} />
  );
}

function Clear(props: SceneProps): ReactNode {
  return (
    <>
      {props.day ? null : (
        <Twinkle px={props.px} colour={props.palette.sun} moving={props.moving} />
      )}
      <Light
        {...props}
        box={props.day ? { x: 8, y: 8, w: 84, h: 84 } : { x: 18, y: 16, w: 64, h: 64 }}
      />
    </>
  );
}

function Overcast({
  px,
  moving,
  palette,
  dark,
}: SceneProps & { readonly dark: boolean }): ReactNode {
  return (
    <Cloud
      box={HIGH_CLOUD}
      px={px}
      colour={dark ? palette.heavy : palette.cloud}
      shade={palette.shade}
      drift={0.05}
      moving={moving}
    />
  );
}

function Wet({
  kind,
  ...props
}: SceneProps & { readonly kind: 'drizzle' | 'rain' | 'snow' | 'storm' }): ReactNode {
  const snow = kind === 'snow';
  const shower: Shower = {
    box: UNDER_CLOUD,
    kind: snow ? 'snow' : 'rain',
    count: kind === 'drizzle' ? 4 : props.heavy ? 7 : 5,
    ms: snow ? 2800 : kind === 'drizzle' ? 1300 : 850,
  };
  return (
    <>
      <Drops
        shower={shower}
        px={props.px}
        colour={snow ? props.palette.snow : props.palette.rain}
        moving={props.moving}
      />
      {kind === 'storm' ? (
        <Bolt
          box={{ x: 42, y: 46, w: 18, h: 30 }}
          px={props.px}
          colour={props.palette.bolt}
          moving={props.moving}
        />
      ) : null}
      <Overcast {...props} dark={kind === 'storm' || props.heavy} />
    </>
  );
}

function PartlyCloudy(props: SceneProps): ReactNode {
  return (
    <>
      <Light {...props} box={{ x: 4, y: 4, w: 60, h: 60 }} />
      <Cloud
        box={{ x: 26, y: 42, w: 68, h: 42 }}
        px={props.px}
        colour={props.palette.cloud}
        shade={props.palette.shade}
        drift={0.06}
        moving={props.moving}
      />
    </>
  );
}

function Cloudy(props: SceneProps): ReactNode {
  return (
    <>
      <Cloud
        box={{ x: 4, y: 20, w: 58, h: 36 }}
        px={props.px}
        colour={props.palette.heavy}
        shade={props.palette.shade}
        drift={0.04}
        moving={props.moving}
      />
      <Cloud
        box={{ x: 28, y: 40, w: 68, h: 42 }}
        px={props.px}
        colour={props.palette.cloud}
        shade={props.palette.shade}
        drift={0.07}
        moving={props.moving}
      />
    </>
  );
}

function Foggy(props: SceneProps): ReactNode {
  return (
    <>
      <Overcast {...props} dark={false} />
      <Mist
        box={{ x: 10, y: 56, w: 80, h: 30 }}
        px={props.px}
        colour={props.palette.cloud}
        moving={props.moving}
      />
    </>
  );
}

function Scene({ kind, ...props }: SceneProps & { readonly kind: WeatherKind }): ReactNode {
  switch (kind) {
    case 'clear':
      return <Clear {...props} />;
    case 'partly_cloudy':
      return <PartlyCloudy {...props} />;
    case 'cloudy':
      return <Cloudy {...props} />;
    case 'fog':
      return <Foggy {...props} />;
    case 'drizzle':
    case 'rain':
    case 'snow':
    case 'storm':
      return <Wet {...props} kind={kind} />;
  }
}

const HEAVY_CODES: ReadonlySet<number> = new Set([55, 65, 67, 75, 82, 86, 99]);

export function WeatherVisual({
  code,
  day,
  px,
}: {
  readonly code: number;
  readonly day: boolean;
  readonly px: VisualPx;
}): ReactNode {
  const ref = useRef<View>(null);
  const onScreen = useOnScreen(ref);
  const { moving } = useAnimationGate(true, onScreen);
  const palette = usePalette();
  return (
    <View ref={ref} pointerEvents="none" className={SIZE_CLASS[px]} aria-hidden>
      <Scene
        kind={weatherKindOf(code)}
        px={px}
        day={day}
        heavy={HEAVY_CODES.has(code)}
        moving={moving}
        palette={palette}
      />
    </View>
  );
}
