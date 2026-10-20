import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Card } from '../../../../components/card';
import { Text } from '../../../../components/text';
import { STATES_COPY } from './states-copy';

export interface MissingKindCardProps {
  readonly kindName: string;
  readonly onReplace: () => void;
  readonly onDelete: () => void;
}

export function MissingKindCard({
  kindName,
  onReplace,
  onDelete,
}: MissingKindCardProps): ReactNode {
  const copy = STATES_COPY.missingKind;
  return (
    <Card title={copy.title(kindName)} icon="alert" tone="critical">
      <View className="gap-3">
        <Text variant="callout" tone="variant">
          {copy.body}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          <Button label={copy.replace} icon="refresh" variant="tonal" onPress={onReplace} />
          <Button label={copy.remove} icon="trash" variant="destructive" onPress={onDelete} />
        </View>
      </View>
    </Card>
  );
}
