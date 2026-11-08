import type { ReactNode } from 'react';
import { use, useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { Logger, messageOf } from '@smarteverything/logging';
import { closeFlow } from '../../../app-shell/close-flow';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { ListLoader } from '../../../components/list-loader';
import { Screen } from '../../../components/screen';
import { ScreenPausedContext, useScreenPaused } from '../../../design/screen-pause';
import { useEntityStore } from '../../../store/store-context';
import { recordInConversation } from './open-voice-conversation';

const log = new Logger('app.voice-message');

function Failed({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}): ReactNode {
  return (
    <View className="items-center gap-3">
      <ErrorState page error={error} retry={retry} />
      <Button
        label="Close"
        variant="outlined"
        onPress={() => {
          closeFlow('/');
        }}
      />
    </View>
  );
}

export function VoiceMessageOpening(): ReactNode {
  const store = useEntityStore();
  const pause = use(ScreenPausedContext);
  const paused = useScreenPaused();
  const [failure, setFailure] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (paused || pause.isPaused()) return undefined;
      let current = true;
      const stop = pause.subscribe(() => {
        if (pause.isPaused()) current = false;
      });
      setFailure(null);
      recordInConversation(store, () => current && !pause.isPaused()).catch((cause: unknown) => {
        if (!current || pause.isPaused()) return;
        log.warn('voice_message.open_failed', { reason: messageOf(cause), attempt });
        setFailure(cause);
      });
      return (): void => {
        current = false;
        stop();
      };
    }, [attempt, store, pause, paused]),
  );
  return (
    <Screen scroll={false}>
      {failure === null ? (
        <ListLoader loading />
      ) : (
        <Failed
          error={failure}
          retry={() => {
            setFailure(null);
            setAttempt((count) => count + 1);
          }}
        />
      )}
    </Screen>
  );
}
