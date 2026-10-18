import { z } from 'zod';
import type { JsonValue } from '@smarteverything/domain';
import { SHELLY_TIME_WINDOW } from '@smarteverything/shelly';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TextField } from '../../components/text-field';
import { Text } from '../../components/text';

export function TimeWindowInput({
  title,
  value,
  change,
}: {
  readonly title: string;
  readonly value: JsonValue | undefined;
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  const parsed = z.array(z.string()).safeParse(value);
  const parts = parsed.success ? parsed.data : [];
  const start = parts.at(0) ?? '';
  const end = parts.at(1) ?? '';
  const error = SHELLY_TIME_WINDOW.safeParse(parts).success
    ? null
    : 'Use device-local HH:MM start and end times.';
  const edit = (nextStart: string, nextEnd: string): void => {
    change(nextStart === '' && nextEnd === '' ? [] : [nextStart, nextEnd]);
  };
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant">
        {title} · device-local time
      </Text>
      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-32 flex-1">
          <TextField
            label="Start (HH:MM)"
            value={start}
            onChange={(next) => {
              edit(next, end);
            }}
          />
        </View>
        <View className="min-w-32 flex-1">
          <TextField
            label="End (HH:MM)"
            value={end}
            onChange={(next) => {
              edit(start, next);
            }}
          />
        </View>
      </View>
      {error === null ? null : <Text tone="critical">{error}</Text>}
    </View>
  );
}
