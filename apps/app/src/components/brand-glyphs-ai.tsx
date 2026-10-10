import type { ReactNode } from 'react';
import { Circle, G, Path } from 'react-native-svg';
import { Frame } from './brand-frame';

export type AiBrand =
  'openrouter' | 'google' | 'anthropic' | 'meta' | 'x-ai' | 'mistral' | 'deepseek' | 'qwen';

const WHITE = '#FFFFFF';

function OpenRouter(): ReactNode {
  return (
    <Frame fill="#6467F2">
      <Path
        d="M5 12h3.5c2 0 2.6-5 5.5-5H19M8.5 12c2 0 2.6 5 5.5 5H19"
        stroke={WHITE}
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="m16.5 4.8 2.6 2.2-2.6 2.2M16.5 14.8l2.6 2.2-2.6 2.2"
        stroke={WHITE}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

function Google(): ReactNode {
  const arc = { strokeWidth: 2.6, fill: 'none' } as const;
  return (
    <Frame fill={WHITE}>
      <Path d="M7.76 7.76A6 6 0 0 1 16.24 7.76" stroke="#EA4335" {...arc} />
      <Path d="M7.76 16.24A6 6 0 0 1 7.76 7.76" stroke="#FBBC05" {...arc} />
      <Path d="M16.24 16.24A6 6 0 0 1 7.76 16.24" stroke="#34A853" {...arc} />
      <Path d="M18 12A6 6 0 0 1 16.24 16.24M12 12h6" stroke="#4285F4" {...arc} />
    </Frame>
  );
}

function Anthropic(): ReactNode {
  return (
    <Frame fill="#191919">
      <G transform="translate(4.8 4.8) scale(0.6)">
        <Path
          d="M17.304 3.541h-3.672l6.696 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.946 2.292 5.946Z"
          fill="#F0EEE6"
        />
      </G>
    </Frame>
  );
}

function Meta(): ReactNode {
  return (
    <Frame fill="#0866FF">
      <Path
        d="M5.2 13.6c0-2.6 1.4-4.6 3.1-4.6 2.6 0 4.6 6 7.3 6 1.5 0 2.2-1.2 2.2-2.7 0-2-1.2-3.3-2.6-3.3-2.6 0-4.4 6-7 6-1.8 0-3-.6-3-1.4Z"
        stroke={WHITE}
        strokeWidth={1.7}
        fill="none"
      />
    </Frame>
  );
}

function XAi(): ReactNode {
  return (
    <Frame fill="#0A0A0A">
      <Path
        d="M6.5 6.5 17.5 17.5M17.5 6.5l-11 11"
        stroke={WHITE}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Frame>
  );
}

function Mistral(): ReactNode {
  return (
    <Frame fill="#FA520F">
      <Path
        d="M5 5.5h3v3H5Zm11 0h3v3h-3ZM5 8.5h6v3H5Zm8 0h6v3h-6ZM5 11.5h14v3H5Zm0 3h3v3H5Zm5.5 0h3v3h-3Zm5.5 0h3v3h-3Z"
        fill={WHITE}
      />
    </Frame>
  );
}

function DeepSeek(): ReactNode {
  return (
    <Frame fill="#4D6BFE">
      <Path
        d="M4.8 12.5c2.4-4.6 8.6-5.4 12.4-2.2L19.4 8v4.6c-2.6 4.4-9 4.9-12.6 1.6Z"
        fill={WHITE}
      />
      <Circle cx={15.2} cy={11.4} r={0.9} fill="#4D6BFE" />
    </Frame>
  );
}

function Qwen(): ReactNode {
  return (
    <Frame fill="#615CED">
      <Path
        d="M12 5.2 18 8.6v6.8L12 18.8 6 15.4V8.6Z"
        stroke={WHITE}
        strokeWidth={1.7}
        fill="none"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={2.2} fill={WHITE} />
    </Frame>
  );
}

export const AI_GLYPHS: Readonly<Record<AiBrand, () => ReactNode>> = {
  openrouter: OpenRouter,
  google: Google,
  anthropic: Anthropic,
  meta: Meta,
  'x-ai': XAi,
  mistral: Mistral,
  deepseek: DeepSeek,
  qwen: Qwen,
};
