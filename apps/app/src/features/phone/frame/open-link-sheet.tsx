import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { PHONE_ACTION } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { TextField } from '../../../components/text-field';
import { hostOf } from '../../../format/text';
import { usePhoneAction } from '../data/phone-action';
import type { Device } from '../../../store/state';

export function OpenLinkSheet({
  device,
  open,
  onClose,
}: {
  readonly device: Device;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const [url, setUrl] = useState('');
  const run = usePhoneAction(device);
  const action = PHONE_ACTION.safeParse({ type: 'open_url', url, label: hostOf(url) ?? '' });
  const send = (): void => {
    if (!action.success) return;
    run(action.data, 'Link sent to the phone');
    setUrl('');
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Open a link on ${device.label}`}
      detents={['half']}
    >
      <View className="gap-4 px-4 pb-6">
        <TextField
          label="Link"
          kind="url"
          value={url}
          onChange={setUrl}
          onSubmit={send}
          placeholder="https://"
          helper="The phone shows a notification; tap it to open the link."
        />
        <Button
          label="Send to phone"
          icon="externalLink"
          disabled={!action.success}
          onPress={send}
        />
      </View>
    </Sheet>
  );
}
