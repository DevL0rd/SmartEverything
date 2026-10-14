import type { ReactNode } from 'react';
import { View } from 'react-native';
import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { structuredImage } from './structured-image';
import { Text } from './text';

function valueText(value: JsonValue): string {
  if (value === null) return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function StructuredValue({
  value,
  title = 'Runtime result',
  depth = 0,
}: {
  readonly value: JsonValue;
  readonly title?: string;
  readonly depth?: number;
}): ReactNode {
  const image = structuredImage(value, title);
  if (image !== null) return image;
  if (typeof value !== 'object' || value === null)
    return (
      <View className="gap-1">
        <Text variant="footnote" tone="variant">
          {title}
        </Text>
        <Text selectable>{valueText(value)}</Text>
      </View>
    );
  if (depth >= 4) return <Text selectable>{JSON.stringify(value, null, 2)}</Text>;
  const rows = Array.isArray(value)
    ? JSON_VALUE.array()
        .parse(value)
        .map((item, index) => ({ key: String(index + 1), value: item }))
    : Object.entries(value).map(([key, item]: [string, JsonValue]) => ({
        key: key.replaceAll('_', ' '),
        value: item,
      }));
  return (
    <View className="gap-3 rounded-lg border border-outline-variant bg-surface-1 p-3">
      <Text variant="label">{title}</Text>
      {rows.length === 0 ? (
        <Text tone="variant">No items returned.</Text>
      ) : (
        rows.map((row) => (
          <StructuredValue key={row.key} title={row.key} value={row.value} depth={depth + 1} />
        ))
      )}
    </View>
  );
}
