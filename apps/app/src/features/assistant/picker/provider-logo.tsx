import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Brand } from '../../../components/brand-glyphs';
import { BrandMark } from '../../../components/brand-mark';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { initialsOf } from '../../../format/text';

const TINTS = [
  'bg-viz-1/20',
  'bg-viz-2/20',
  'bg-viz-3/20',
  'bg-viz-4/20',
  'bg-viz-5/20',
  'bg-viz-6/20',
] as const;

function tintOf(provider: string): string {
  let hash = 0;
  for (const char of provider) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return TINTS[hash % TINTS.length] ?? 'bg-surface-3';
}

const MAKER_BRANDS: Readonly<Record<string, Brand>> = {
  openrouter: 'openrouter',
  google: 'google',
  anthropic: 'anthropic',
  openai: 'chatgpt',
  'meta-llama': 'meta',
  meta: 'meta',
  'x-ai': 'x-ai',
  mistralai: 'mistral',
  mistral: 'mistral',
  deepseek: 'deepseek',
  qwen: 'qwen',
};

function ProviderLogoBase({
  provider,
  name,
  size = 'm',
}: {
  readonly provider: string;
  readonly name: string;
  readonly size?: 's' | 'm';
}): ReactNode {
  const brand = MAKER_BRANDS[provider];
  if (brand !== undefined) {
    return <BrandMark brand={brand} size={size === 's' ? 24 : 32} />;
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={name}
      className={cn(
        'items-center justify-center rounded-md',
        size === 's' ? 'size-6' : 'size-8',
        tintOf(provider),
      )}
    >
      <Text variant={size === 's' ? 'caption' : 'label'}>{initialsOf(name).slice(0, 2)}</Text>
    </View>
  );
}

export const ProviderLogo = memo(ProviderLogoBase);
