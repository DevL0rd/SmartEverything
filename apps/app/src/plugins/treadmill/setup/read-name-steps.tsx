import type { TreadmillGattDump } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { count } from '../../../format/number';

export type ReadStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'done'; readonly dump: TreadmillGattDump };

export function ReadStep({
  status,
  onRead,
}: {
  readonly status: ReadStatus;
  readonly onRead: () => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        SmartEverything connects once, reads what the treadmill offers and disconnects. Nothing is
        written to the belt.
      </Text>
      {status.kind === 'reading' ? (
        <View className="flex-row items-center gap-3 rounded-md bg-surface-2 p-4">
          <ActivityIndicator size="small" colorClassName="accent-primary" />
          <Text variant="callout" accessibilityLiveRegion="polite">
            Reading the treadmill…
          </Text>
        </View>
      ) : null}
      {status.kind === 'failed' ? (
        <Banner
          tone="critical"
          title="The treadmill did not answer"
          body={`${status.reason} KS Fit may still be holding the belt; close it on every phone and try again.`}
          wrapBody
        />
      ) : null}
      {status.kind === 'done' ? (
        <Banner
          tone="positive"
          title="Read the treadmill"
          body={`${count(status.dump.services.length)} Bluetooth services found. This decides how SmartEverything talks to it.`}
          wrapBody
        />
      ) : null}
      {status.kind === 'done' ? null : (
        <Button
          label={status.kind === 'failed' ? 'Try again' : 'Read the treadmill'}
          size="lg"
          loading={status.kind === 'reading'}
          onPress={onRead}
        />
      )}
    </View>
  );
}

export interface RoomOption {
  readonly value: string;
  readonly label: string;
}

export function NameStep({
  name,
  room,
  rooms,
  onName,
  onRoom,
}: {
  readonly name: string;
  readonly room: string;
  readonly rooms: readonly RoomOption[];
  readonly onName: (name: string) => void;
  readonly onRoom: (room: string) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField label="Name" value={name} onChange={onName} />
      <List inset>
        <SelectRow
          icon="door"
          title="Room"
          options={[{ value: '', label: 'No room' }, ...rooms]}
          value={room}
          onChange={onRoom}
        />
      </List>
    </View>
  );
}
