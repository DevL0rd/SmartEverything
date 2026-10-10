import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { ColourRole } from '../../design/tokens';
import { Button } from '../button';
import { Figure, type FigureSize } from '../figure';
import type { IconName } from '../icon';
import { IconWell } from '../icon-well';
import { Text } from '../text';
import type { Tone } from '../tone';
import type { WidgetSize } from './types';

const HERO: Readonly<Record<WidgetSize, FigureSize>> = {
  S: 'm',
  M: 'l',
  W: 'l',
  L: 'xl',
  XL: 'xl',
};

export function heroFigure(size: WidgetSize): FigureSize {
  return HERO[size];
}

export function isTall(size: WidgetSize): boolean {
  return size === 'L' || size === 'XL';
}

export interface WidgetStatProps {
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly caption?: string;
  readonly tone?: Tone;
  readonly stale?: boolean;
}

export function WidgetStat({
  icon,
  colour,
  label,
  value,
  unit,
  caption,
  tone,
  stale = false,
}: WidgetStatProps): ReactNode {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
      <IconWell icon={icon} colour={colour} size="m" />
      <View className="min-w-0 flex-1">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {label}
        </Text>
        <Figure
          value={value}
          size="s"
          stale={stale}
          {...(unit === undefined ? {} : { unit })}
          {...(tone === undefined ? {} : { tone })}
        />
        {caption === undefined ? null : (
          <Text variant="caption" tone="faint" numberOfLines={1}>
            {caption}
          </Text>
        )}
      </View>
    </View>
  );
}

export function WidgetStats({
  stats,
  columns,
}: {
  readonly stats: readonly (WidgetStatProps & { readonly key: string })[];
  readonly columns: number;
}): ReactNode {
  const rows: (WidgetStatProps & { readonly key: string })[][] = [];
  for (let index = 0; index < stats.length; index += columns) {
    rows.push(stats.slice(index, index + columns));
  }
  return (
    <View className="gap-3">
      {rows.map((row) => (
        <View key={row.map((stat) => stat.key).join()} className="flex-row gap-3">
          {row.map(({ key, ...stat }) => (
            <WidgetStat key={key} {...stat} />
          ))}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`gap-${String(index)}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

export interface WidgetEmptyProps {
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly title: string;
  readonly body?: string;
  readonly action?: { readonly label: string; readonly href: Href };
  readonly size: WidgetSize;
}

export function WidgetEmpty({
  icon,
  colour,
  title,
  body,
  action,
  size,
}: WidgetEmptyProps): ReactNode {
  const small = size === 'S';
  return (
    <View className={small ? 'flex-1 justify-end gap-2' : 'flex-1 flex-row items-center gap-4'}>
      <IconWell icon={icon} colour={colour} size={small ? 'm' : 'l'} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
          {title}
        </Text>
        {body === undefined || small ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>
      {action === undefined || small ? null : (
        <Button label={action.label} href={action.href} variant="tonal" />
      )}
    </View>
  );
}
