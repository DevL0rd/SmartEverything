import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { callActive, changeCall, type CallView } from '../call-state';
import { callEngine } from '../engine/engine';
import { CallControls } from './call-controls';

export interface CallFooterProps {
  readonly call: CallView;
  readonly onAgain: () => void;
  readonly onClose: () => void;
}

function allowThenCall(onAgain: () => void): void {
  callEngine.allowMicrophone().then(
    (allowed) => {
      if (allowed) {
        onAgain();
      }
    },
    () => {
      changeCall(() => ({ problem: 'The microphone settings didn’t open' }));
    },
  );
}

function EndedActions({ call, onAgain, onClose }: CallFooterProps): ReactNode {
  const microphone = call.fix === 'microphone';
  return (
    <View className="w-full gap-3">
      {microphone ? (
        <Button
          label="Allow microphone"
          icon="mic"
          size="lg"
          onPress={() => {
            allowThenCall(onAgain);
          }}
        />
      ) : null}
      <View className="flex-row gap-3">
        <Button label="Close" variant="tonal" size="lg" grow onPress={onClose} />
        <Button
          label="Call again"
          icon="phone"
          variant={microphone ? 'tonal' : 'filled'}
          size="lg"
          grow
          onPress={onAgain}
        />
      </View>
    </View>
  );
}

export function CallFooter(props: CallFooterProps): ReactNode {
  const { call } = props;
  if (!callActive(call)) {
    return <EndedActions {...props} />;
  }
  return (
    <CallControls
      muted={call.muted}
      onMute={() => {
        callEngine.mute(!call.muted);
      }}
      onEnd={callEngine.end}
    />
  );
}
