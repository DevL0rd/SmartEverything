import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { usePrinterActor } from '../data/use-printer-view';
import { PrintForm } from '../print/print-sheet';

export function PrintSection({ device }: { readonly device: Device }): ReactNode {
  const actor = usePrinterActor(device);
  return (
    <View className="gap-section-gap">
      <PrintForm device={device} enabled />
      <Card title="Test page" icon="printer">
        <View className="gap-3">
          <Text variant="footnote" tone="variant">
            Prints one page with colour and alignment patterns to check the printer.
          </Text>
          <View className="flex-row">
            <Button
              label="Print test page"
              variant="tonal"
              onPress={() => {
                actor.fire(
                  { action: 'test_page', printer: device.external_id },
                  'Could not print the test page',
                );
              }}
            />
          </View>
        </View>
      </Card>
    </View>
  );
}
