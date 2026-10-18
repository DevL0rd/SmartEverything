import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { NeedLine } from '../screens/detail-parts';
import { StackBar } from './stack-bar';
import {
  partsOf,
  summaryParts,
  storageSpoken,
  usedShare,
  usedText,
  type StorageSection,
} from './storage-model';

const FREE_WIDEST = '888';

function freeFigure(storage: StorageSection): { readonly value: string; readonly unit: string } {
  const text = bytes(storage.freeBytes);
  const [value = text, unit = ''] = text.split(/\s/);
  return { value, unit: `${unit} free` };
}

export function StorageCard({
  storage,
  needsAccess,
  offline,
}: {
  readonly storage: StorageSection;
  readonly needsAccess: boolean;
  readonly offline: boolean;
}): ReactNode {
  const free = freeFigure(storage);
  return (
    <Card title="Storage" icon="layers">
      <View className="flex-row flex-wrap items-baseline gap-x-3">
        <LiveFigure
          value={free.value}
          unit={free.unit}
          size="l"
          widest={FREE_WIDEST}
          stale={offline}
        />
        <Text variant="callout" tone="variant">
          {`of ${bytes(storage.totalBytes)} · ${usedText(storage)}`}
        </Text>
      </View>
      <StackBar
        parts={needsAccess ? summaryParts(storage) : partsOf(storage)}
        label={
          needsAccess
            ? `Storage ${String(Math.round(usedShare(storage) * 100))} percent used`
            : storageSpoken(storage)
        }
        thick
      />
      {needsAccess ? (
        <NeedLine text="Allow App usage access on the phone to see what takes the space" />
      ) : null}
    </Card>
  );
}
