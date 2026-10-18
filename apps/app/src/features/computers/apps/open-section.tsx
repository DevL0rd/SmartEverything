import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { TextField } from '../../../components/text-field';
import { useDevice } from '../../../store/selectors';
import { offersAction, useComputerCommand } from '../data/computer-device';
import { openTargetError } from './apps-model';

export function OpenSection({
  deviceId,
  machine,
  online,
}: {
  readonly deviceId: string;
  readonly machine: string;
  readonly online: boolean;
}): ReactNode {
  const device = useDevice(deviceId);
  if (device === null || !offersAction(device, 'open')) return null;
  return <OpenCard device={device} machine={machine} online={online} />;
}

function OpenCard({
  device,
  machine,
  online,
}: {
  readonly device: NonNullable<ReturnType<typeof useDevice>>;
  readonly machine: string;
  readonly online: boolean;
}): ReactNode {
  const run = useComputerCommand(device);
  const [text, setText] = useState('');
  const error = openTargetError(text);
  const send = (): void => {
    if (error !== null || text.trim() === '') return;
    run('open', text.trim());
    setText('');
  };
  return (
    <Card title={`Open on ${machine}`} icon="externalLink">
      <View className="gap-2">
        <TextField
          label="Link or file path"
          value={text}
          onChange={setText}
          onSubmit={send}
          placeholder="https://example.com or /home/me/report.pdf"
          error={text.trim() === '' ? null : error}
          disabled={!online}
        />
        <Button
          label="Open"
          icon="externalLink"
          disabled={!online || text.trim() === '' || error !== null}
          onPress={send}
        />
      </View>
    </Card>
  );
}
