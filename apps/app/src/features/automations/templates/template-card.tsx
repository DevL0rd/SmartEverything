import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { CATEGORY_LABELS, type Category, type Template } from '../model/templates/parameters';
import type { TakenIdea } from '../model/templates/taken';

export const CATEGORY_ICONS: Readonly<Record<Category, IconName>> = {
  lights: 'bulb',
  comfort: 'thermometer',
  safety: 'shield',
  appliances: 'plug',
  presence: 'motion',
  computers: 'monitor',
  notifications: 'bell',
  learn: 'sparkles',
};

const MOST_CHIPS = 4;

export interface TemplateCardProps {
  readonly entry: Template;
  readonly preview: readonly string[];
  readonly taken: TakenIdea | null;
  readonly onUse: (entry: Template) => void;
}

function Outline({ lines }: { readonly lines: readonly string[] }): ReactNode {
  return (
    <View className="gap-1 rounded-md bg-surface-2 px-3 py-2">
      {lines.map((line, index) => (
        <Text key={`${String(index)}:${line}`} variant="footnote" tone="variant" numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function DeviceChips({ labels }: { readonly labels: readonly string[] }): ReactNode {
  if (labels.length === 0) return null;
  const rest = labels.length - MOST_CHIPS;
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {labels.slice(0, MOST_CHIPS).map((label) => (
        <Badge key={label} label={label} tone="neutral" />
      ))}
      {rest > 0 ? <Badge label={`+${String(rest)}`} tone="neutral" /> : null}
    </View>
  );
}

export function TemplateCard({ entry, preview, taken, onUse }: TemplateCardProps): ReactNode {
  const label = taken === null ? entry.title : `${entry.title}, already set up`;
  return (
    <Card
      label={label}
      onPress={() => {
        onUse(entry);
      }}
    >
      <View className="flex-row items-start gap-3">
        <View className="size-10 items-center justify-center rounded-full bg-primary-container">
          <Icon name={CATEGORY_ICONS[entry.category]} size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong" numberOfLines={2}>
            {entry.title}
          </Text>
          <Text variant="callout" tone="variant" numberOfLines={2}>
            {entry.why}
          </Text>
        </View>
      </View>
      <Outline lines={preview} />
      <DeviceChips labels={entry.devices} />
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Badge label={CATEGORY_LABELS[entry.category]} tone="primary" />
          {taken === null ? null : (
            <Badge
              label={taken.enabled ? 'Already on' : 'Already made'}
              tone="positive"
              icon="check"
            />
          )}
        </View>
        <Button
          label={taken === null ? 'Use template' : 'Make another'}
          variant={taken === null ? 'tonal' : 'text'}
          onPress={() => {
            onUse(entry);
          }}
        />
      </View>
    </Card>
  );
}
