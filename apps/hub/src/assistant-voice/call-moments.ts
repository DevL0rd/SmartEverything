import type { CallEnding, CallSignalSource } from '@smarteverything/domain';
import type { Call } from './call-parts';

interface CallFacts {
  readonly callId: string;
  readonly source: CallSignalSource;
  readonly profileId: string;
  readonly person: string;
  readonly device: string;
  readonly at: Date;
}

export type CallMoment =
  | (CallFacts & { readonly kind: 'started' })
  | (CallFacts & {
      readonly kind: 'ended';
      readonly ending: CallEnding;
      readonly durationSeconds: number;
    });

export type CallMomentListener = (moment: CallMoment) => void;

function factsOf(call: Call, at: Date): CallFacts {
  return {
    callId: call.id,
    source: call.source ?? 'hosted',
    profileId: call.caller.profileId,
    person: call.caller.person,
    device: call.caller.device,
    at,
  };
}

export class CallMoments {
  private readonly listeners = new Set<CallMomentListener>();

  on(listener: CallMomentListener): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  started(call: Call): void {
    this.announce({ kind: 'started', ...factsOf(call, call.startedAt) });
  }

  ended(call: Call, ending: CallEnding, at: Date): void {
    const durationSeconds = Math.max(
      0,
      Math.round((at.getTime() - call.startedAt.getTime()) / 1000),
    );
    this.announce({ kind: 'ended', ...factsOf(call, at), ending, durationSeconds });
  }

  private announce(moment: CallMoment): void {
    this.listeners.forEach((listener) => {
      listener(moment);
    });
  }
}
