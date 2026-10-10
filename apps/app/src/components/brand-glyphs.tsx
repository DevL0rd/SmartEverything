import type { ReactNode } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Frame } from './brand-frame';
import { AI_GLYPHS, type AiBrand } from './brand-glyphs-ai';

export type Brand =
  | AiBrand
  | 'xiaomi'
  | 'tuya'
  | 'smartthings'
  | 'samsung'
  | 'claude'
  | 'chatgpt'
  | 'claude-code'
  | 'cursor'
  | 'vscode'
  | 'mcp'
  | 'health-connect'
  | 'fitbit'
  | 'smarteverything';

const RAYS = Array.from({ length: 12 }, (_unused, index) => index * 30);

function Xiaomi(): ReactNode {
  return (
    <Frame fill="#FF6900">
      <Path
        d="M5.5 8h7.2a3.3 3.3 0 0 1 3.3 3.3V16h-2.2v-4.5a1.3 1.3 0 0 0-1.3-1.3H7.7V16H5.5Zm4 4h2.2v4H9.5Zm7.8-4h2.2v8h-2.2Z"
        fill="#FFFFFF"
      />
    </Frame>
  );
}

function SmartLife(): ReactNode {
  return (
    <Frame fill="#FF5A28">
      <Path d="M12 5.2 5 11v7.6h5v-4.4h4v4.4h5V11Z" fill="#FFFFFF" />
    </Frame>
  );
}

function SmartThings(): ReactNode {
  return (
    <Frame fill="#15BFFF">
      <Circle cx={12} cy={12} r={6.2} stroke="#FFFFFF" strokeWidth={2} fill="none" />
      <Circle cx={12} cy={5.8} r={1.9} fill="#FFFFFF" />
      <Circle cx={17.4} cy={15.1} r={1.9} fill="#FFFFFF" />
      <Circle cx={6.6} cy={15.1} r={1.9} fill="#FFFFFF" />
    </Frame>
  );
}

function Samsung(): ReactNode {
  return (
    <Frame fill="#1428A0">
      <Path
        d="M15.5 8.6c-.6-1.2-1.9-1.9-3.6-1.9-2.1 0-3.6 1.1-3.6 2.8 0 3.4 5.5 2.4 5.5 4.6 0 .8-.8 1.4-2 1.4-1.3 0-2.1-.6-2.5-1.6l-1.8.9c.6 1.5 2.1 2.5 4.3 2.5 2.4 0 4-1.2 4-3.1 0-3.6-5.5-2.6-5.5-4.8 0-.7.7-1.2 1.6-1.2 1 0 1.6.4 2 1.2Z"
        fill="#FFFFFF"
      />
    </Frame>
  );
}

function ClaudeBurst({ colour }: { readonly colour: string }): ReactNode {
  return (
    <G>
      {RAYS.map((angle) => (
        <Path
          key={angle}
          d="M12 4a.9.9 0 0 1 .9.9v6.2a.9.9 0 0 1-1.8 0V4.9A.9.9 0 0 1 12 4Z"
          fill={colour}
          transform={`rotate(${String(angle)} 12 12)`}
        />
      ))}
    </G>
  );
}

function Claude(): ReactNode {
  return (
    <Frame fill="#F4EDE4">
      <ClaudeBurst colour="#D97757" />
    </Frame>
  );
}

function ClaudeCode(): ReactNode {
  return (
    <Frame fill="#D97757">
      <Path
        d="m6.5 8 4 4-4 4"
        stroke="#FFFFFF"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12.5 16.5h5" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
    </Frame>
  );
}

function ChatGpt(): ReactNode {
  return (
    <Frame fill="#0D0D0D">
      <G>
        {[0, 60, 120].map((angle) => (
          <Path
            key={angle}
            d="M12 4.5a3 3 0 0 1 3 3v9a3 3 0 0 1-6 0v-9a3 3 0 0 1 3-3Z"
            stroke="#FFFFFF"
            strokeWidth={1.5}
            fill="none"
            transform={`rotate(${String(angle)} 12 12)`}
          />
        ))}
      </G>
    </Frame>
  );
}

function Cursor(): ReactNode {
  return (
    <Frame fill="#14120B">
      <Path
        d="M12 4.5 18.5 8.2v7.6L12 19.5l-6.5-3.7V8.2Z"
        stroke="#EDECEC"
        strokeWidth={1.4}
        fill="none"
      />
      <Path d="M5.5 8.2 12 12l6.5-3.8M12 12v7.5" stroke="#EDECEC" strokeWidth={1.4} fill="none" />
    </Frame>
  );
}

function VsCode(): ReactNode {
  return (
    <Frame fill="#0065A9">
      <Path d="M16.5 4.5v15l-9-7.5Z" fill="#FFFFFF" opacity={0.9} />
      <Path d="m5 9.2 2-1.4 9.5 8.2v3.5Z" fill="#FFFFFF" />
    </Frame>
  );
}

function Mcp(): ReactNode {
  return (
    <Frame fill="#3A3A40">
      <Path
        d="m6 12 6-6a2.8 2.8 0 0 1 4 4l-5 5m3-7-5 5a2.8 2.8 0 0 0 4 4l5-5"
        stroke="#FFFFFF"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
      />
    </Frame>
  );
}

function HealthConnect(): ReactNode {
  return (
    <Frame fill="#FFFFFF">
      <Path
        d="M12 18.5s-6.5-3.8-6.5-8.3A3.6 3.6 0 0 1 12 8.1a3.6 3.6 0 0 1 6.5 2.1c0 4.5-6.5 8.3-6.5 8.3Z"
        fill="#4285F4"
      />
    </Frame>
  );
}

const FITBIT_DOTS = [
  [12, 5.5, 1.3],
  [12, 9.2, 1.6],
  [12, 13, 1.9],
  [12, 16.8, 1.6],
  [12, 20.3, 1.3],
  [15.9, 9.2, 1.3],
  [15.9, 13, 1.6],
  [15.9, 16.8, 1.3],
  [19.6, 13, 1.3],
  [8.1, 13, 1.3],
] as const;

function Fitbit(): ReactNode {
  return (
    <Frame fill="#00B0B9">
      {FITBIT_DOTS.map(([cx, cy, r]) => (
        <Circle
          key={`${String(cx)}-${String(cy)}`}
          cx={cx - 1.9}
          cy={cy - 0.9}
          r={r}
          fill="#FFFFFF"
        />
      ))}
    </Frame>
  );
}

function SmartEverything(): ReactNode {
  return (
    <Frame fill="#1B1B1F">
      <Path
        d="M12 5.5 5.5 11v7.5h13V11Z"
        stroke="#F2B45E"
        strokeWidth={1.8}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={13.5} r={1.8} fill="#F2B45E" />
    </Frame>
  );
}

const GLYPHS: Readonly<Record<Brand, () => ReactNode>> = {
  ...AI_GLYPHS,
  xiaomi: Xiaomi,
  tuya: SmartLife,
  smartthings: SmartThings,
  samsung: Samsung,
  claude: Claude,
  chatgpt: ChatGpt,
  'claude-code': ClaudeCode,
  cursor: Cursor,
  vscode: VsCode,
  mcp: Mcp,
  'health-connect': HealthConnect,
  fitbit: Fitbit,
  smarteverything: SmartEverything,
};

export function BrandGlyph({
  brand,
  size,
}: {
  readonly brand: Brand;
  readonly size: number;
}): ReactNode {
  const Glyph = GLYPHS[brand];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Glyph />
    </Svg>
  );
}
