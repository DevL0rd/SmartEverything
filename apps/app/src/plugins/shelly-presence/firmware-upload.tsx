import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { pickFiles, type PickedFile } from '../../platform/pick-files';
import { actionAvailable, operatePresence } from './presence-operation';
import { failure } from './use-presence-operation';

function base64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

async function send(sensor: ShellyDevice, file: PickedFile): Promise<void> {
  const bytes = new Uint8Array(await file.data());
  const started = await operatePresence(sensor, {
    action: 'firmware_upload_start',
    params: { size: bytes.length },
  });
  if (started.state !== 'accepted') throw new Error(started.message);
  try {
    const written = await operatePresence(sensor, {
      action: 'firmware_upload_write',
      params: { offset: 0, data: base64(bytes) },
    });
    if (written.state !== 'accepted') throw new Error(written.message);
  } catch (error) {
    await operatePresence(sensor, { action: 'firmware_upload_abort' });
    throw error;
  }
}

interface Upload {
  readonly file: PickedFile | null;
  readonly busy: boolean;
  readonly status: string | null;
  readonly choose: () => void;
  readonly upload: () => void;
}

function useUpload(sensor: ShellyDevice): Upload {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return {
    file,
    busy,
    status,
    choose: (): void => {
      pickFiles('files')
        .then((selected) => {
          setFile(selected[0] ?? null);
          setStatus(null);
        })
        .catch((error: unknown) => {
          setStatus(failure(error));
        });
    },
    upload: (): void => {
      if (file === null) return;
      setBusy(true);
      setStatus(null);
      send(sensor, file)
        .then(() => {
          setStatus('File accepted by the device. Check firmware status after it reconnects.');
        })
        .catch((error: unknown) => {
          setStatus(failure(error));
        })
        .finally(() => {
          setBusy(false);
        });
    },
  };
}

export function FirmwareUpload({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const { file, busy, status, choose, upload } = useUpload(sensor);
  return (
    <View className="gap-3">
      <Text variant="title-3">Upload firmware file</Text>
      <Button label="Choose firmware file" variant="tonal" disabled={busy} onPress={choose} />
      <Text>
        {file === null ? 'No file selected' : `${file.name} · ${String(file.bytes)} bytes`}
      </Text>
      <Button
        label="Upload selected firmware"
        variant="destructive"
        loading={busy}
        disabled={file === null || !actionAvailable(sensor, 'firmware_upload_start')}
        onPress={upload}
      />
      {status === null ? null : (
        <Text selectable accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </View>
  );
}
