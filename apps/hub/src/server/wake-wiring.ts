import type { AiOutreachRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { assistantNames } from '../assistant-voice/persona';
import type { Clock } from '../clock';
import type { ReachRules } from '../reach/reach-rules';
import type { ReachService } from '../reach/reach-service';
import type { Ears, SpeechSegment } from '../wake-name/ear';
import type { OnSuperseded, WakeClaim, WakeClaims } from '../wake-name/wake-claims';
import type { WakeTest } from '../wake-name/wake-test';
import { WakeListeners } from '../wake-name/wake-listeners';
import type { Store } from '../store/store';
import type { ServerContext } from './context';
import { messageOf } from '@smarteverything/logging';

export interface WakeWiring {
  readonly rules: ReachRules;
  readonly service: ReachService;
  readonly ears: Ears;
  readonly claims: WakeClaims;
  readonly test: WakeTest;
  readonly speech: (cameraId: string, segment: SpeechSegment) => void;
  readonly clock: Clock;
  readonly log: Logger;
}

function wakeReason(phrase: string): string {
  return `Someone near this camera just said “${phrase}”. If they asked something with it, answer that; if they only said your name, greet them in a word or two (like “Yes?”).`;
}

const WINNER_LABELS: Readonly<Record<WakeClaim['source'], string>> = {
  voice_call: 'Discord',
  talk: 'a walkie-talkie channel',
  camera: 'another camera',
  phone: 'a phone',
  computer: 'a computer',
};

export interface CameraWakeDeps {
  readonly store: Pick<Store, 'profiles' | 'aiOutreach'>;
  readonly service: Pick<ReachService, 'camera' | 'hangUp'>;
  readonly log: Logger;
}

export interface CameraWake {
  readonly cameraId: string;
  readonly phrase: string;
  readonly heard: () => Int16Array;
}

export async function wakeCamera(
  deps: CameraWakeDeps,
  wake: CameraWake,
  onSuperseded: OnSuperseded,
): Promise<void> {
  const { store, service, log } = deps;
  let winner: WakeClaim | null = null;
  let row: AiOutreachRow | null = null;
  const settle = (): void => {
    if (winner === null || row === null) {
      return;
    }
    const answered = row;
    const by = WINNER_LABELS[winner.source];
    service
      .hangUp(answered.id)
      .then(() => {
        store.aiOutreach.step(answered.id, { state: 'ended', detail: `Answered by ${by}` });
      })
      .catch((cause: unknown) => {
        log.warn('wake.supersede_failed', {
          cameraId: wake.cameraId,
          reason: messageOf(cause),
        });
      });
  };
  onSuperseded((claim) => {
    winner = claim;
    settle();
  });
  row = await service.camera(
    { profileId: store.profiles.first().id, role: 'owner', clientId: null, chatId: null },
    { cameraId: wake.cameraId, reason: wakeReason(wake.phrase) },
    wake.heard,
  );
  settle();
}

export function startWakeName(context: ServerContext, wiring: WakeWiring): WakeListeners {
  const { store } = context;
  const listeners = new WakeListeners({
    store,
    rules: wiring.rules,
    microphones: context.talk.camera.microphones,
    speakers: context.talk.camera.speakers,
    ears: wiring.ears,
    claims: wiring.claims,
    test: wiring.test,
    names: (): string[] => assistantNames(store),
    wake: (cameraId, phrase, heard, onSuperseded): Promise<void> =>
      wakeCamera(
        { store, service: wiring.service, log: wiring.log },
        { cameraId, phrase, heard },
        onSuperseded,
      ),
    speech: wiring.speech,
    clock: wiring.clock,
    log: wiring.log.forArea('hub.wake-name'),
  });
  wiring.rules.onCamerasChanged(() => {
    listeners.sync();
  });
  listeners.start();
  return listeners;
}
