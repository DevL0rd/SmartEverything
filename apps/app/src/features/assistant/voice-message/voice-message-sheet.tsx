import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify, notifyFailure } from '../../../components/toast-store';
import { playTime } from '../../../format/time';
import { attachFiles } from '../data/uploads';
import { useVoiceRecorder, type VoiceRecorder } from './use-voice-recorder';
import type { RecorderOutcome } from './voice-recorder-machine';

const failed = notifyFailure('The voice message was not recorded');

function attached(outcome: RecorderOutcome): boolean {
  if (outcome.kind === 'file') {
    attachFiles([outcome.file]);
    return true;
  }
  notify({
    message:
      outcome.kind === 'too_short'
        ? 'That was too short; hold on a little longer and speak.'
        : 'Nothing was recorded.',
    tone: 'critical',
  });
  return false;
}

function Status({ recorder }: { readonly recorder: VoiceRecorder }): ReactNode {
  const recording = recorder.phase === 'recording';
  return (
    <View className="items-center gap-3 py-6">
      <View
        className={
          recording
            ? 'size-16 items-center justify-center rounded-full bg-critical/14'
            : 'size-16 items-center justify-center rounded-full bg-surface-2'
        }
      >
        <Icon name="mic" size={32} tone={recording ? 'critical' : 'default'} />
      </View>
      <Text variant="title-2" aria-live="polite">
        {playTime(recording ? recorder.seconds : 0)}
      </Text>
      <Text variant="footnote" tone="variant" align="center">
        {recorder.denied
          ? 'Allow the microphone to record a voice message.'
          : 'It is attached to your message and the AI hears what you said.'}
      </Text>
    </View>
  );
}

export function VoiceMessageSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const recorder = useVoiceRecorder();
  const recording = recorder.phase === 'recording';
  const close = (): void => {
    recorder.cancel().then(onClose, failed);
  };
  const attach = (): void => {
    recorder
      .finish()
      .then((outcome) => {
        if (attached(outcome)) {
          onClose();
        }
      })
      .catch(failed);
  };
  const footer = recording ? (
    <View className="flex-row gap-2">
      <Button label="Cancel" variant="outlined" onPress={close} />
      <Button label="Attach" icon="check" grow onPress={attach} />
    </View>
  ) : (
    <Button
      label="Record"
      icon="mic"
      loading={recorder.phase === 'saving' || recorder.phase === 'requesting'}
      onPress={() => {
        recorder.start().catch(failed);
      }}
    />
  );
  return (
    <Sheet open={open} onClose={close} title="Voice message" detents={['fit']} footer={footer}>
      <Status recorder={recorder} />
    </Sheet>
  );
}
