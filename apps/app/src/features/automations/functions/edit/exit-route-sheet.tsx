import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { Sheet } from '../../../../components/sheet';
import { Text } from '../../../../components/text';
import type { Routing } from './use-interface-panel';

export interface ExitRouteSheetProps {
  readonly routing: Routing | null;
  readonly choices: readonly string[];
  readonly onPick: (exit: string) => void;
  readonly onCancel: () => void;
}

export function ExitRouteSheet({
  routing,
  choices,
  onPick,
  onCancel,
}: ExitRouteSheetProps): ReactNode {
  return (
    <Sheet open={routing !== null} onClose={onCancel} title="Which exit instead?">
      <View className="gap-3">
        <Text variant="callout" tone="variant">
          {routing === null
            ? ''
            : `${routing.returns.join(', ')} leave${routing.returns.length === 1 ? 's' : ''} through ${routing.exit}. Choose the exit they use instead.`}
        </Text>
        <View className="gap-2">
          {choices
            .filter((name) => name !== routing?.exit)
            .map((name) => (
              <Button
                key={name}
                label={`Leave through ${name}`}
                variant="outlined"
                onPress={() => {
                  onPick(name);
                }}
              />
            ))}
        </View>
      </View>
    </Sheet>
  );
}
