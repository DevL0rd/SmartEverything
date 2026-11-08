import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { DialogFrame } from '../../../../components/dialog-frame';
import { OtpField } from '../../../../components/otp-field';
import { Text } from '../../../../components/text';
import { VIDEO_PASSWORD_DIGITS, isVideoPassword } from '../data/vacuum-video';
import { PASSWORD_KEPT, WRONG_PASSWORD } from '../model/video-copy';

export const PASSWORD_TITLE = "Enter the robot's video password";

export function VideoPasswordDialog({
  wrong,
  onSubmit,
  onCancel,
}: {
  readonly wrong: boolean;
  readonly onSubmit: (password: string) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const [password, setPassword] = useState('');
  const ready = isVideoPassword(password);
  const submit = (): void => {
    if (ready) onSubmit(password);
  };
  return (
    <DialogFrame
      open
      onClose={onCancel}
      label={PASSWORD_TITLE}
      title={PASSWORD_TITLE}
      kind="dialog"
      footer={
        <View className="flex-row justify-end gap-2">
          <Button label="Cancel" variant="text" onPress={onCancel} />
          <Button label="Open camera" icon="camera" disabled={!ready} onPress={submit} />
        </View>
      }
    >
      <View className="gap-4">
        <OtpField
          label="4 digit video password"
          value={password}
          onChange={setPassword}
          onSubmit={submit}
          format={{ digits: VIDEO_PASSWORD_DIGITS }}
          error={wrong ? WRONG_PASSWORD : null}
          focusOnMount
          boxes
        />
        <Text variant="footnote" tone="variant">
          {`The password you set in Xiaomi Home. ${PASSWORD_KEPT}`}
        </Text>
      </View>
    </DialogFrame>
  );
}
