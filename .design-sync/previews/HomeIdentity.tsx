import type { ReactNode } from 'react';
import { Text as NativeText, View } from 'react-native';
import { Stage, Text } from 'smarteverything-kit';

const lines = [
  '3FA9 1C07 D25B 8E46',
  'A0C7 F135 9DE2 B684',
  'C017 3AA9 F5E8 D1B2',
  '764C 9A03 E58D F1AB',
];

function Identity(): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        Home identity
      </Text>
      <View
        className="gap-1 rounded-md border border-outline bg-surface-2 p-4"
        accessible
        accessibilityLabel={`Home identity: ${lines.join(' ')}`}
      >
        {lines.map((line) => (
          <NativeText
            key={line}
            selectable
            className="text-center font-mono text-callout text-on-surface"
          >
            {line}
          </NativeText>
        ))}
      </View>
      <Text variant="footnote" tone="variant">
        Confirm this matches the code shown on your hub.
      </Text>
    </View>
  );
}

export const Fingerprint = (): ReactNode => (
  <Stage theme="dark" width={420}>
    <Identity />
  </Stage>
);

export const LightTheme = (): ReactNode => (
  <Stage theme="light" width={420}>
    <Identity />
  </Stage>
);
