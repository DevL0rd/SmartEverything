import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { useAnimatedReaction, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Logger, messageOf } from '@smarteverything/logging';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useMotion } from '../../../design/motion';
import type { PickedFile } from '../../../platform/pick-files';
import { LiveControls, PreviewControls } from './recorder-controls';
import { LiveWave } from './recorder-live-wave';
import { RecorderPreview } from './recorder-preview';
import { RecorderReadout, type ReadoutState } from './recorder-readout';
import { SHEET_WAVE, dbText, decibelsOf, peakCopy } from './recorder-wave-model';
import type { VoiceRecorder } from './use-voice-recorder';
import type { RecordedClip, RecorderOutcome, StopOutcome } from './voice-recorder-machine';

const log = new Logger('app.voice-message');

export type Delivery = 'send' | 'attach';

export interface VoiceMessageSheetProps {
  readonly recorder: VoiceRecorder;
  readonly onClose: () => void;
  readonly onDeliver: (file: PickedFile, delivery: Delivery) => void;
  readonly onFailed: (cause: unknown) => void;
}

interface Pending {
  readonly delivery: Delivery;
  readonly clip: RecordedClip | null;
}

interface Flow {
  readonly pending: Pending | null;
  readonly short: boolean;
  readonly deliver: (delivery: Delivery) => void;
  readonly stop: () => void;
  readonly again: () => void;
}

function LiveDb({ level }: { readonly level: SharedValue<number> }): ReactNode {
  const [db, setDb] = useState(() => decibelsOf(level.get()));
  useAnimatedReaction(
    () => decibelsOf(level.get()),
    (now, before) => {
      if (now !== before) scheduleOnRN(setDb, now);
    },
  );
  return (
    <Text variant="caption" tone="variant" className="tabular">
      {dbText(db)}
    </Text>
  );
}

function Caption({ recorder }: { readonly recorder: VoiceRecorder }): ReactNode {
  if (recorder.phase === 'recording') return <LiveDb level={recorder.level} />;
  if (recorder.phase !== 'paused' && recorder.clip === null) return null;
  return (
    <Text variant="caption" tone="variant" className="tabular">
      {recorder.clip === null ? 'Paused' : peakCopy(recorder.clip.peak)}
    </Text>
  );
}

function Header({ recorder }: { readonly recorder: VoiceRecorder }): ReactNode {
  return (
    <View className="flex-row items-center justify-between px-4 pt-2">
      <Text variant="label">Voice message</Text>
      <Caption recorder={recorder} />
    </View>
  );
}

function NoticeLine(props: {
  readonly icon: IconName;
  readonly text: string;
  readonly action: string;
  readonly onAction: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5 px-4 pb-3.5 pt-3" aria-live="polite">
      <Icon name={props.icon} size={16} tone="variant" />
      <Text variant="footnote" tone="variant">
        {props.text}
      </Text>
      <Interactive label={props.action} onPress={props.onAction} layerClassName="rounded-sm">
        <Text variant="footnote" tone="primary">
          {props.action}
        </Text>
      </Interactive>
    </View>
  );
}

function readoutOf(phase: VoiceRecorder['phase']): ReadoutState {
  if (phase === 'recording') return 'live';
  return phase === 'paused' ? 'paused' : 'waiting';
}

function openSettings(): void {
  Linking.openSettings().catch((cause: unknown) => {
    log.warn('voice_message.settings_failed', { reason: messageOf(cause) });
  });
}

function useFlow(props: VoiceMessageSheetProps): Flow {
  const { recorder, onDeliver, onFailed, onClose } = props;
  const [pending, setPending] = useState<Pending | null>(null);
  const [short, setShort] = useState(false);
  const settle = (outcome: RecorderOutcome | StopOutcome, delivery: Delivery): void => {
    if (outcome.kind === 'file') onDeliver(outcome.file, delivery);
    else if (outcome.kind === 'too_short') setShort(true);
    else if (outcome.kind === 'empty') onClose();
  };
  const fail = (cause: unknown): void => {
    setPending(null);
    onFailed(cause);
  };
  return {
    pending,
    short,
    deliver: (delivery): void => {
      setPending({ delivery, clip: recorder.clip });
      recorder
        .finish()
        .then((outcome) => {
          setPending(null);
          settle(outcome, delivery);
        })
        .catch(fail);
    },
    stop: (): void => {
      recorder
        .stop()
        .then((outcome) => {
          settle(outcome, 'attach');
        })
        .catch(fail);
    },
    again: (): void => {
      setShort(false);
      recorder
        .cancel()
        .then(() => recorder.start())
        .catch(fail);
    },
  };
}

interface BodyProps {
  readonly recorder: VoiceRecorder;
  readonly flow: Flow;
  readonly onClose: () => void;
}

function LiveBody({ recorder, flow, onClose }: BodyProps): ReactNode {
  const { reduced } = useMotion();
  const paused = recorder.phase === 'paused';
  return (
    <>
      <View className="pb-2.5 pt-1">
        <RecorderReadout
          level={recorder.level}
          seconds={recorder.seconds}
          state={readoutOf(recorder.phase)}
          reduced={reduced}
        />
        <View className={paused ? 'px-4 opacity-70' : 'px-4'}>
          <LiveWave
            level={recorder.level}
            elapsedMs={recorder.elapsedMs}
            shape={SHEET_WAVE}
            fade
            className="h-10"
          />
        </View>
      </View>
      <LiveControls
        paused={paused}
        ready={recorder.phase === 'recording' || paused}
        sending={flow.pending?.delivery === 'send'}
        onDelete={onClose}
        onPause={recorder.pause}
        onResume={recorder.resume}
        onStop={flow.stop}
        onSend={() => {
          flow.deliver('send');
        }}
      />
    </>
  );
}

function PreviewBody({
  clip,
  flow,
  onClose,
}: BodyProps & { readonly clip: RecordedClip }): ReactNode {
  return (
    <>
      <RecorderPreview clip={clip} />
      <PreviewControls
        sending={flow.pending?.delivery === 'send'}
        onDelete={onClose}
        onAgain={flow.again}
        onAttach={() => {
          flow.deliver('attach');
        }}
        onSend={() => {
          flow.deliver('send');
        }}
      />
    </>
  );
}

function Body(props: BodyProps): ReactNode {
  const { recorder, flow } = props;
  const { phase, denied } = recorder;
  const clip = flow.pending === null ? recorder.clip : flow.pending.clip;
  if (denied && phase === 'idle') {
    return (
      <NoticeLine
        icon="mic"
        text="Allow the microphone to record."
        action="Open settings"
        onAction={openSettings}
      />
    );
  }
  if (flow.short && phase === 'idle') {
    return (
      <NoticeLine
        icon="info"
        text="That was too short to send."
        action="Record again"
        onAction={flow.again}
      />
    );
  }
  if (clip !== null) return <PreviewBody {...props} clip={clip} />;
  return <LiveBody {...props} />;
}

export function VoiceMessageSheet(props: VoiceMessageSheetProps): ReactNode {
  const flow = useFlow(props);
  return (
    <Sheet subpage open onClose={props.onClose} label="Voice message" detents={['fit']}>
      <Header recorder={props.recorder} />
      <Body recorder={props.recorder} flow={flow} onClose={props.onClose} />
    </Sheet>
  );
}
