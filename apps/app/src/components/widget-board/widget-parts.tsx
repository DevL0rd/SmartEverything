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
import { WidgetSurface } from './widget-frame';
import { useWidgetActions } from './widget-scope';

const HERO: Readonly<Record<WidgetSize, FigureSize>> = {
  M: 'l',
  W: 'l',
  XL: 'xl',
};

export function heroFigure(size: WidgetSize): FigureSize {
  return HERO[size];
}

export function isTall(size: WidgetSize): boolean {
  return size === 'XL';
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
}

export function WidgetEmpty({ icon, colour, title, body, action }: WidgetEmptyProps): ReactNode {
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <IconWell icon={icon} colour={colour} size="l" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong" numberOfLines={2}>
          {title}
        </Text>
        {body === undefined ? null : (
          <Text variant="footnote" tone="variant" numberOfLines={2}>
            {body}
          </Text>
        )}
      </View>
      {action === undefined ? null : (
        <Button label={action.label} href={action.href} variant="tonal" />
      )}
    </View>
  );
}

export interface WidgetGoneProps {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

export function WidgetGone({ icon, title, body }: WidgetGoneProps): ReactNode {
  const actions = useWidgetActions();
  return (
    <WidgetSurface>
      <View className="flex-1 justify-center gap-3 p-card-pad">
        <View className="flex-row items-center gap-3">
          <IconWell icon={icon} colour="warning" size="m" />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text variant="body-strong" numberOfLines={2}>
              {title}
            </Text>
            <Text variant="footnote" tone="variant" numberOfLines={2}>
              {body}
            </Text>
          </View>
        </View>
        {actions === null ? null : (
          <View className="flex-row flex-wrap gap-2">
            <Button label="Choose another" variant="tonal" onPress={actions.choose} />
            <Button label="Remove" variant="text" onPress={actions.remove} />
          </View>
        )}
      </View>
    </WidgetSurface>
  );
}
