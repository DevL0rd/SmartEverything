import type { SyncthingSnapshot } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { copyText } from '../../../components/copy-button';
import { QrCode } from '../../../components/qr-code';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';

const QR_SIZE = 220;

function Id({ id }: { readonly id: string }): ReactNode {
  return (
    <Text variant="callout" selectable className="font-mono">
      {id}
    </Text>
  );
}

function CopyId({ id }: { readonly id: string }): ReactNode {
  return (
    <Button
      label="Copy ID"
      variant="tonal"
      icon="copy"
      onPress={() => {
        copyText(id, 'ID');
      }}
    />
  );
}

function QrSheet({
  id,
  open,
  onClose,
}: {
  readonly id: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Add this computer in Syncthing">
      <View className="items-center gap-4 pb-4">
        <QrCode text={id} size={QR_SIZE} label="Syncthing ID of this computer" />
        <Id id={id} />
        <CopyId id={id} />
      </View>
    </Sheet>
  );
}

export function ThisComputer({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  const [showing, setShowing] = useState(false);
  const id = snapshot.myId;
  if (id === null) {
    return null;
  }
  return (
    <Card title="This computer">
      <Text variant="footnote" tone="variant">
        Syncthing ID
      </Text>
      <Id id={id} />
      <View className="flex-row flex-wrap gap-2">
        <CopyId id={id} />
        <Button
          label="Show QR"
          variant="tonal"
          icon="qr"
          onPress={() => {
            setShowing(true);
          }}
        />
      </View>
      <QrSheet
        id={id}
        open={showing}
        onClose={() => {
          setShowing(false);
        }}
      />
    </Card>
  );
}
