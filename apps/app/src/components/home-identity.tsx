import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { HUB_FINGERPRINT } from '@smarteverything/domain';
import { Text } from './text';

function identityLines(
  value: string,
): readonly { readonly index: number; readonly text: string }[] {
  const digest = HUB_FINGERPRINT.parse(value).toUpperCase();
  return Array.from({ length: 4 }, (_, line) => ({
    index: line,
    text: Array.from({ length: 4 }, (_, group) => {
      const start = line * 16 + group * 4;
      return digest.slice(start, start + 4);
    }).join(' '),
  }));
}

export function HomeIdentity({
  value,
  helper,
}: {
  readonly value: string;
  readonly helper: string;
}): ReactNode {
  const lines = identityLines(value);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Home identity
      </Text>
      <View
        className="gap-1 rounded-md border border-outline bg-surface-2 p-4"
        accessible
        accessibilityLabel={`Home identity: ${lines.map((line) => line.text).join(' ')}`}
      >
        {lines.map((line) => (
          <NativeText
            key={line.index}
            selectable
            className="text-center font-mono text-callout text-on-surface"
          >
            {line.text}
          </NativeText>
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        {helper}
      </Text>
    </View>
  );
}
