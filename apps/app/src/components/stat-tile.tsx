import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { Figure } from './figure';
import { Interactive } from './interactive';
import { Text } from './text';
import type { Tone } from './tone';

export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly trend?: ReactNode;
  readonly tone?: Tone;
  readonly caption?: string;
  readonly stale?: boolean;
  readonly onPress?: () => void;
  readonly href?: Href;
}

export function StatTile({
  label,
  value,
  unit,
  trend,
  tone,
  caption,
  stale = false,
  onPress,
  href,
}: StatTileProps): ReactNode {
  const frame = 'min-h-24 gap-1 rounded-lg bg-surface-2 p-3';
  const content = (
    <>
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        {label}
      </Text>
      <Figure
        value={value}
        size="s"
        stale={stale}
        {...(unit === undefined ? {} : { unit })}
        {...(tone === undefined ? {} : { tone })}
      />
      {trend === undefined ? null : <View className="h-8">{trend}</View>}
      {caption === undefined ? null : (
        <Text variant="caption" tone={stale ? 'warning' : 'faint'} numberOfLines={1}>
          {caption}
        </Text>
      )}
    </>
  );
  if (onPress === undefined && href === undefined) {
    return <View className={frame}>{content}</View>;
  }
  return (
    <Interactive
      onPress={onPress}
      href={href}
      label={`${label} ${value}`}
      className={cn(frame)}
      layerClassName="rounded-lg"
    >
      {content}
    </Interactive>
  );
}
