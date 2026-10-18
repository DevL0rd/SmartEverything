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
  readonly compact?: boolean;
  readonly onPress?: () => void;
  readonly href?: Href;
}

type TileBodyProps = Pick<
  StatTileProps,
  'label' | 'value' | 'unit' | 'trend' | 'tone' | 'caption'
> & { readonly stale: boolean; readonly compact: boolean };

function TileText({ label, value, unit, tone, stale, compact }: TileBodyProps): ReactNode {
  return (
    <>
      <Text variant={compact ? 'caption' : 'footnote'} tone="variant" numberOfLines={1}>
        {label}
      </Text>
      <Figure
        value={value}
        size="s"
        stale={stale}
        {...(unit === undefined ? {} : { unit })}
        {...(tone === undefined ? {} : { tone })}
      />
    </>
  );
}

function TileNote({
  caption,
  stale,
}: {
  readonly caption: string | undefined;
  readonly stale: boolean;
}): ReactNode {
  return caption === undefined ? null : (
    <Text variant="caption" tone={stale ? 'warning' : 'faint'} numberOfLines={1}>
      {caption}
    </Text>
  );
}

function TileBody(props: TileBodyProps): ReactNode {
  const { trend, compact } = props;
  const text = <TileText {...props} />;
  const note = <TileNote caption={props.caption} stale={props.stale} />;
  if (compact) {
    return (
      <>
        <View className="min-w-0 flex-1">
          {text}
          {note}
        </View>
        {trend === undefined ? null : <View className="h-6 w-16">{trend}</View>}
      </>
    );
  }
  return (
    <>
      {text}
      {trend === undefined ? null : <View className="h-8">{trend}</View>}
      {note}
    </>
  );
}

export function StatTile({
  onPress,
  href,
  stale = false,
  compact = false,
  ...rest
}: StatTileProps): ReactNode {
  const frame = cn(
    'rounded-lg bg-surface-2',
    compact ? 'min-h-16 flex-row items-center gap-2 p-2' : 'min-h-24 gap-1 p-3',
  );
  const content = <TileBody {...rest} stale={stale} compact={compact} />;
  if (onPress === undefined && href === undefined) {
    return <View className={frame}>{content}</View>;
  }
  return (
    <Interactive
      onPress={onPress}
      href={href}
      label={`${rest.label} ${rest.value}`}
      className={frame}
      layerClassName="rounded-lg"
    >
      {content}
    </Interactive>
  );
}
