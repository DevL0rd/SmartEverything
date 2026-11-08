import { useEffect, useEffectEvent, useState, type ReactNode } from 'react';
import { notify, notifyFailure } from '../../../components/toast-store';
import { useMotion } from '../../../design/motion';
import { useStableCallback } from '../../../design/use-stable-callback';
import { lightTap, successBuzz, warningBuzz } from '../../../platform/haptics';
import type { PickedFile } from '../../../platform/pick-files';
import { attachFiles } from '../data/uploads';
import { holdReleaseOf, type HoldChannel, type HoldHandle, type HoldZone } from './recorder-hold';
import { HoldStrip } from './recorder-hold-strip';
import { useVoiceRecorder, type VoiceRecorder } from './use-voice-recorder';
import { VoiceMessageSheet, type Delivery } from './voice-message-sheet';
import type { RecorderOutcome } from './voice-recorder-machine';

export type SessionMode = 'hold' | 'sheet';

export interface VoiceSessionProps {
  readonly mode: SessionMode;
  readonly micOffset: number;
  readonly channel: HoldChannel;
  readonly onMode: (mode: SessionMode | null) => void;
  readonly onSend: () => void;
}

const failure = notifyFailure('The voice message was not recorded');

interface Session {
  readonly recorder: VoiceRecorder;
  readonly end: () => void;
  readonly fail: (cause: unknown) => void;
  readonly deliver: (file: PickedFile, delivery: Delivery) => void;
}

function useSession({ onMode, onSend }: VoiceSessionProps): Session {
  const recorder = useVoiceRecorder(true);
  const end = useStableCallback((): void => {
    onMode(null);
  });
  const fail = (cause: unknown): void => {
    failure(cause);
    end();
  };
  const deliver = (file: PickedFile, delivery: Delivery): void => {
    attachFiles([file]);
    if (delivery === 'send') {
      successBuzz();
      onSend();
    }
    end();
  };
  const begin = useEffectEvent((): void => {
    recorder.start().catch(fail);
  });
  useEffect(() => {
    begin();
  }, []);
  return { recorder, end, fail, deliver };
}

function holdHandle(
  props: VoiceSessionProps,
  session: Session,
  setZone: (zone: HoldZone) => void,
  setShort: (short: boolean) => void,
): HoldHandle {
  const { recorder, end, fail, deliver } = session;
  const finished = (outcome: RecorderOutcome): void => {
    if (outcome.kind === 'file') deliver(outcome.file, 'send');
    else if (outcome.kind === 'too_short') setShort(true);
    else {
      notify({ message: 'Nothing was recorded.', tone: 'critical' });
      end();
    }
  };
  const holding = props.mode === 'hold';
  return {
    move: (zone): void => {
      if (!holding) return;
      if (zone === 'lock') {
        recorder.lock();
        lightTap();
        props.onMode('sheet');
        return;
      }
      setZone(zone);
    },
    release: (zone): void => {
      if (!holding) return;
      const release = holdReleaseOf(zone, recorder.phase === 'recording');
      if (release === 'cancel') {
        warningBuzz();
        recorder.cancel().then(end, fail);
      } else if (release === 'send') {
        recorder.finish().then(finished, fail);
      } else props.onMode('sheet');
    },
    interrupt: (): void => {
      if (holding) props.onMode('sheet');
    },
  };
}

function useChannel(channel: HoldChannel, live: () => HoldHandle): void {
  useEffect(
    () =>
      channel.attach({
        move: (next) => {
          live().move(next);
        },
        release: (next) => {
          live().release(next);
        },
        interrupt: () => {
          live().interrupt();
        },
      }),
    [channel, live],
  );
}

export function VoiceSession(props: VoiceSessionProps): ReactNode {
  const [zone, setZone] = useState<HoldZone>('hold');
  const [short, setShort] = useState(false);
  const session = useSession(props);
  const { reduced } = useMotion();
  useChannel(
    props.channel,
    useStableCallback(() => holdHandle(props, session, setZone, setShort)),
  );
  if (props.mode === 'sheet') {
    return (
      <VoiceMessageSheet
        recorder={session.recorder}
        onClose={() => {
          session.recorder.cancel().then(session.end, session.fail);
        }}
        onDeliver={session.deliver}
        onFailed={session.fail}
      />
    );
  }
  return (
    <HoldStrip
      micOffset={props.micOffset}
      zone={zone}
      short={short}
      seconds={session.recorder.seconds}
      level={session.recorder.level}
      elapsedMs={session.recorder.elapsedMs}
      reduced={reduced}
      onShortShown={session.end}
    />
  );
}
