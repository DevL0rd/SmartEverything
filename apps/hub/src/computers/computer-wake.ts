import type { AiOutreachRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ReachService } from '../reach/reach-service';
import type { Store } from '../store/store';
import type { OnSuperseded, WakeClaim } from '../wake-name/wake-claims';
import { messageOf } from '@smarteverything/logging';

export interface ComputerWakeDeps {
  readonly store: Pick<Store, 'profiles' | 'aiOutreach'>;
  readonly service: Pick<ReachService, 'computer' | 'hangUp'>;
  readonly log: Logger;
}

export interface ComputerWake {
  readonly computerId: string;
  readonly phrase: string;
  readonly heard: () => Int16Array;
}

export function answeredBy(winner: WakeClaim): string {
  switch (winner.source) {
    case 'voice_call':
      return 'Discord';
    case 'talk':
      return 'a walkie-talkie channel';
    case 'camera':
      return 'a camera';
    case 'phone':
      return 'a phone';
    case 'computer':
      return 'another computer';
  }
}

function reasonOf(phrase: string): string {
  return `Someone near this computer just said “${phrase}”. If they asked something with it, answer that; if they only said your name, greet them in a word or two (like “Yes?”).`;
}

export async function wakeComputer(
  deps: ComputerWakeDeps,
  wake: ComputerWake,
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
    const by = answeredBy(winner);
    service
      .hangUp(answered.id)
      .then(() => {
        store.aiOutreach.step(answered.id, { state: 'ended', detail: `Answered by ${by}` });
      })
      .catch((cause: unknown) => {
        log.warn('wake.supersede_failed', {
          computerId: wake.computerId,
          reason: messageOf(cause),
        });
      });
  };
  onSuperseded((claim) => {
    winner = claim;
    settle();
  });
  row = await service.computer(
    { profileId: store.profiles.first().id, role: 'owner', clientId: null, chatId: null },
    { computerId: wake.computerId, reason: reasonOf(wake.phrase) },
    wake.heard,
  );
  settle();
}
