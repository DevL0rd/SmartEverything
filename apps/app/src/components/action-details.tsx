import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { Button } from './button';
import { Text } from './text';

function label(key: string): string {
  return key
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}
function Detail({
  title,
  value,
}: {
  readonly title: string;
  readonly value: JsonValue;
}): ReactNode {
  if (/token|password|secret|credential|authorization|api.?key/i.test(title))
    return <Text tone="variant">{title}: hidden</Text>;
  if (value === null) return <Text tone="variant">{title}: not supplied</Text>;
  if (typeof value !== 'object')
    return (
      <View className="gap-1">
        <Text variant="caption" tone="variant">
          {title}
        </Text>
        <Text selectable>
          {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
        </Text>
      </View>
    );
  return (
    <View className="gap-3">
      {Object.entries(value).map(([key, item]) => (
        <Detail
          key={key}
          title={Array.isArray(value) ? `${title} ${String(Number(key) + 1)}` : label(key)}
          value={item}
        />
      ))}
    </View>
  );
}
function expandable(value: JsonValue): boolean {
  return typeof value === 'object' && value !== null;
}
export function ActionDetails({
  value,
  title = 'Requested action',
}: {
  readonly value: JsonValue;
  readonly title?: string;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const main =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.entries(value).filter(([key]) =>
          ['command', 'cwd', 'path', 'file_path', 'reason', 'plan', 'permissions'].includes(key),
        )
      : [];
  return (
    <View className="gap-2">
      {main.length === 0 ? (
        typeof value !== 'object' ? (
          <Detail title={title} value={value} />
        ) : (
          <Text variant="footnote" tone="variant">
            {title}
          </Text>
        )
      ) : (
        main.map(([key, item]) => <Detail key={key} title={label(key)} value={item} />)
      )}
      {!expandable(value) ? null : (
        <>
          <Button
            label={expanded ? 'Hide action details' : 'Show action details'}
            variant="text"
            onPress={() => {
              setExpanded(!expanded);
            }}
          />
          {expanded ? (
            <View className="gap-3 rounded-md bg-surface-2 p-3">
              <Detail title={title} value={value} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
