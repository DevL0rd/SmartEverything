import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { usePresenceResourceRefresh } from './resource-refresh';
export function ResourceReload(): ReactNode {
  const refresh = usePresenceResourceRefresh();
  const [error, setError] = useState<string | null>(null);
  const reload = (): void => {
    if (refresh === null) return;
    refresh()
      .then(() => {
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(String(caught));
      });
  };
  return (
    <View className="gap-1">
      <Button
        label="Reload accepted resource data"
        variant="tonal"
        disabled={refresh === null}
        onPress={reload}
      />
      {error === null ? null : <Text tone="critical">{error}</Text>}
    </View>
  );
}
