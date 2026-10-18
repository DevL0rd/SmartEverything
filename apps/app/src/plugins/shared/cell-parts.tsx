import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Badge, type BadgeTone } from '../../components/badge';
import { Button } from '../../components/button';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';
import type { Tone } from '../../components/tone';
import { cn } from '../../design/cn';

export interface CellChip {
  readonly tone: BadgeTone;
  readonly label: string;
}

export function CellBadge({ chip }: { readonly chip: CellChip }): ReactNode {
  return <Badge label={chip.label} tone={chip.tone} />;
}

export function CellLine({
  text,
  tone = 'variant',
}: {
  readonly text: string;
  readonly tone?: Tone;
}): ReactNode {
  return (
    <Text variant="footnote" tone={tone} numberOfLines={1}>
      {text}
    </Text>
  );
}

export function CellWhy({
  text,
  critical = false,
}: {
  readonly text: string;
  readonly critical?: boolean;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1" pointerEvents="none">
      {critical ? <Icon name="warning" size={16} tone="critical" /> : null}
      <Text variant="footnote" tone={critical ? 'critical' : 'variant'} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

export function SetUpButton({ pluginId }: { readonly pluginId: string }): ReactNode {
  return (
    <Button
      label="Set up"
      variant="filled"
      size="md"
      icon="settings"
      href={href.pluginSettings(pluginId)}
    />
  );
}

export function LegendDot({
  swatch,
  label,
}: {
  readonly swatch: string;
  readonly label: string;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1" aria-hidden>
      <View className={cn('size-2 rounded-full', swatch)} />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
