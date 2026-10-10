import type { CallAudioPref, EchoTestOutcome } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { rawErrorText } from '../../../../../format/errors';
import type { Playback } from '../../../../talk';
import type { CallPhase } from '../../call-state';
import { measureEcho, outcomeOf } from './echo-test';
import { MicrophoneChain, type MicrophoneHandlers } from './microphone';
import type { SpeechGateSink } from './speech-gate';

const log = new Logger('app.assistant-call');

const NO_SINK: SpeechGateSink = {
  start: () => undefined,
  packet: () => undefined,
  end: () => undefined,
};

export interface InCallTest {
  readonly mic: MicrophoneChain | null;
  readonly playback: Playback;
  readonly audio: CallAudioPref;
  readonly phase: CallPhase;
  readonly hold: () => void;
  readonly release: () => void;
}

async function run(
  mic: MicrophoneChain,
  playback: Playback,
  audio: CallAudioPref,
): Promise<EchoTestOutcome> {
  const measurement = await measureEcho({
    observe: (listener) => mic.observe(listener),
    probe: (samples, rate) => playback.probe(samples, rate),
  });
  const outcome = outcomeOf(measurement);
  log.info('call.echo_test', {
    outcome,
    echo: audio.echo,
    output: audio.output,
    floor: measurement.floor,
    noisy: measurement.noisy,
    residual: measurement.residual,
    probability: measurement.probability,
  });
  return outcome;
}

export async function measureInCall(test: InCallTest): Promise<EchoTestOutcome> {
  const gate = test.mic?.gateReady ?? null;
  if (test.mic === null || gate === null || test.phase !== 'listening' || test.playback.playing()) {
    log.warn('call.echo_test_unavailable', { phase: test.phase });
    return 'failed';
  }
  gate.reset();
  test.hold();
  try {
    return await run(test.mic, test.playback, test.audio);
  } finally {
    test.release();
    gate.reset();
  }
}

export async function measureAlone(
  audio: CallAudioPref,
  playback: Playback,
): Promise<EchoTestOutcome> {
  const handlers: MicrophoneHandlers = {
    sink: NO_SINK,
    assistantAudible: () => false,
    muted: () => true,
    failure: (problem, error) => {
      log.warn('call.echo_test_mic_failed', { problem, reason: rawErrorText(error) });
    },
  };
  const mic = new MicrophoneChain(audio, handlers);
  try {
    await mic.listen(await mic.open());
    return await run(mic, playback, audio);
  } finally {
    await mic.stop();
  }
}
