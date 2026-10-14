import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { pickFiles, type PickedFile } from '../../platform/pick-files';
import { operatePresence } from './presence-data';
import { presenceActionAvailable } from './availability';

function base64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
async function sendFile(
  sensor: ShellyPresenceDevice,
  bytes: Uint8Array,
  cancelled: () => boolean,
  progress: (offset: number) => void,
): Promise<void> {
  const started = await operatePresence(sensor, {
    action: 'firmware_upload_start',
    size: bytes.length,
  });
  if (started.state !== 'accepted') throw new Error(started.message);
  let offset = 0;
  while (offset < bytes.length && !cancelled()) {
    const chunk = bytes.slice(offset, offset + 2048);
    const result = await operatePresence(sensor, {
      action: 'firmware_upload_write',
      offset,
      data: base64(chunk),
    });
    if (result.state !== 'accepted') throw new Error(result.message);
    if (
      result.result?.kind !== 'firmware_upload_write' ||
      result.result.value.offset !== offset + chunk.length
    )
      throw new Error('Device upload offset did not match. Abort before retrying.');
    offset = result.result.value.offset;
    progress(offset);
  }
  if (cancelled())
    throw new Error('Upload cancelled. Abort the device upload session before retrying.');
}

interface FirmwareDraft {
  readonly file: PickedFile | null;
  readonly busy: boolean;
  readonly offset: number;
  readonly message: string | null;
  readonly select: () => Promise<void>;
  readonly upload: () => Promise<void>;
  readonly abort: () => Promise<void>;
}
function useFirmwareUpload(sensor: ShellyPresenceDevice): FirmwareDraft {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const cancel = useRef(false);
  const select = async (): Promise<void> => {
    try {
      const selected = await pickFiles('files');
      setFile(selected[0] ?? null);
      setOffset(0);
      setMessage(null);
    } catch (error) {
      setMessage(String(error));
    }
  };
  const upload = async (): Promise<void> => {
    if (file === null) return;
    setBusy(true);
    cancel.current = false;
    setMessage(null);
    try {
      const bytes = new Uint8Array(await file.data());
      if (bytes.length < 1 || bytes.length > 16777216)
        throw new Error('Choose a firmware file between 1 byte and 16 MiB.');
      await sendFile(sensor, bytes, () => cancel.current, setOffset);
      setMessage('File accepted by the device. Check firmware status after the device reconnects.');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setBusy(false);
    }
  };
  const abort = async (): Promise<void> => {
    cancel.current = true;
    if (busy) return;
    try {
      const result = await operatePresence(sensor, { action: 'firmware_upload_abort' });
      setMessage(result.state === 'accepted' ? 'Upload session aborted.' : result.message);
    } catch (error) {
      setMessage(String(error));
    }
  };
  return { file, busy, offset, message, select, upload, abort };
}

export function FirmwareUpload({ sensor }: { readonly sensor: ShellyPresenceDevice }): ReactNode {
  const { file, busy, offset, message, select, upload, abort } = useFirmwareUpload(sensor);
  return (
    <View className="gap-3">
      <Text variant="title-3">Upload firmware file</Text>
      <Button
        label="Choose firmware file"
        variant="tonal"
        disabled={busy}
        onPress={() => {
          void select();
        }}
      />
      <Text>
        {file === null ? 'No file selected' : `${file.name} · ${String(file.bytes)} bytes`}
      </Text>
      <Button
        label="Upload selected firmware"
        variant="destructive"
        loading={busy}
        disabled={file === null || !presenceActionAvailable(sensor, 'firmware_upload_start')}
        onPress={() => {
          void upload();
        }}
      />
      <Button
        label={busy ? 'Cancel after current chunk' : 'Abort upload session'}
        variant="text"
        disabled={!presenceActionAvailable(sensor, 'firmware_upload_abort')}
        onPress={() => {
          void abort();
        }}
      />
      <Text variant="footnote" tone="variant">
        Accepted bytes: {String(offset)}
      </Text>
      {message === null ? null : (
        <Text selectable accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
    </View>
  );
}
