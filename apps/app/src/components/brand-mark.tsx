import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { BrandGlyph, type Brand } from './brand-glyphs';

const BRAND_NAMES: Readonly<Record<Brand, string>> = {
  openrouter: 'OpenRouter',
  google: 'Google',
  anthropic: 'Anthropic',
  meta: 'Meta',
  'x-ai': 'xAI',
  mistral: 'Mistral',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  xiaomi: 'Xiaomi',
  tuya: 'Smart Life',
  smartthings: 'SmartThings',
  samsung: 'Samsung',
  claude: 'Claude',
  chatgpt: 'ChatGPT',
  cursor: 'Cursor',
  vscode: 'VS Code',
  mcp: 'Other app',
  'health-connect': 'Health Connect',
  fitbit: 'Fitbit',
  smarteverything: 'SmartEverything',
};

export function BrandMark({
  brand,
  size = 24,
}: {
  readonly brand: Brand;
  readonly size?: 24 | 32 | 40;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={BRAND_NAMES[brand]}
      className={cn(
        'overflow-hidden border-hairline border-outline-variant',
        size === 24 ? 'rounded-xs' : 'rounded-md',
      )}
    >
      <BrandGlyph brand={brand} size={size} />
    </View>
  );
}
