import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { exportPresenceText } from './export-text';
export function TextExportButton({
  name,
  content,
  title,
}: {
  readonly name: string;
  readonly content: string;
  readonly title: string;
}): ReactNode {
  const [error, setError] = useState<string | null>(null);
  const share = (): void => {
    exportPresenceText(name, content).catch((caught: unknown) => {
      setError(String(caught));
    });
  };
  return (
    <View className="gap-1">
      <Button label={title} icon="share" variant="tonal" onPress={share} />
      {error === null ? null : <Text tone="critical">{error}</Text>}
    </View>
  );
}
