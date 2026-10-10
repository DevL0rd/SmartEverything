import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { costText } from '../data/cost';

export function EstimateNote({ micros }: { readonly micros: number }): ReactNode {
  const [open, setOpen] = useState(false);
  if (micros === 0) {
    return null;
  }
  return (
    <View className="-my-2 flex-row items-center gap-1">
      <Text variant="caption" tone="variant">
        {`${costText(micros)} estimated`}
      </Text>
      <IconButton
        icon="info"
        label="What does estimated mean?"
        onPress={() => {
          setOpen(true);
        }}
      />
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Estimated costs"
        detents={['fit']}
      >
        <Text variant="body" className="pb-4">
          Some costs are our estimate until the AI provider confirms the final price, usually within
          a minute. Calls and very new requests show as estimated. The total updates by itself when
          the final price arrives.
        </Text>
      </Sheet>
    </View>
  );
}
