import type { Logger } from '@smarteverything/logging';
import { assistantNames } from '../assistant-voice/persona';
import type { Clock } from '../clock';
import type { ReachRules } from '../reach/reach-rules';
import type { ReachService } from '../reach/reach-service';
import { WakeListeners } from '../wake-name/wake-listeners';
import type { ServerContext } from './context';

export interface WakeWiring {
  readonly rules: ReachRules;
  readonly service: ReachService;
  readonly clock: Clock;
  readonly log: Logger;
}

function wakeReason(phrase: string): string {
  return `Someone near this camera just said “${phrase}”. If they asked something with it, answer that; if they only said your name, greet them in a word or two (like “Yes?”).`;
}

export function startWakeName(context: ServerContext, wiring: WakeWiring): WakeListeners {
  const { store } = context;
  const listeners = new WakeListeners({
    store,
    rules: wiring.rules,
    microphones: context.talk.camera.microphones,
    names: (): string[] => assistantNames(store),
    wake: async (cameraId: string, phrase: string, heard: () => Int16Array): Promise<void> => {
      const owner = store.profiles.first();
      await wiring.service.camera(
        { profileId: owner.id, role: 'owner', clientId: null, chatId: null },
        { cameraId, reason: wakeReason(phrase) },
        heard,
      );
    },
    clock: wiring.clock,
    log: wiring.log.forArea('hub.wake-name'),
  });
  wiring.rules.onCamerasChanged(() => {
    listeners.sync();
  });
  listeners.start();
  return listeners;
}
