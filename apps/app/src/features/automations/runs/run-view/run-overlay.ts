import type { Activation, ActivationStatus } from './run-activation';
import { shownIn } from './run-loops';

export const DEFAULT_ITEM_NAME = 'Time';

export function statusAt(activation: Activation, at: number | null): ActivationStatus | null {
  if (at === null) return activation.status;
  const start = activation.startMs ?? activation.endMs ?? 0;
  if (start > at) return null;
  if (activation.endMs !== null) {
    return activation.endMs <= at ? activation.status : 'running';
  }
  return activation.status === 'waiting' ? 'waiting' : activation.status;
}

export function recordsAt(
  activations: readonly Activation[],
  at: number | null,
): readonly Activation[] {
  return activations.flatMap((activation): Activation[] => {
    const status = statusAt(activation, at);
    return status === null ? [] : [{ ...activation, status }];
  });
}

export function activationFor(
  activations: readonly Activation[],
  chosen: ReadonlyMap<string, number>,
  nodeId: string | null,
): Activation | null {
  if (nodeId === null) return null;
  const shown = activations.filter(
    (activation) => activation.nodeId === nodeId && shownIn(activation, chosen),
  );
  return shown.reduce<Activation | null>(
    (best, next) => (best === null || next.seq > best.seq ? next : best),
    null,
  );
}

export function runningNodeOf(
  activations: readonly Activation[],
  chosen: ReadonlyMap<string, number>,
): string | null {
  const running = activations.filter(
    (activation) => activation.status === 'running' && shownIn(activation, chosen),
  );
  return (
    running.reduce<Activation | null>(
      (best, next) => (best === null || next.seq > best.seq ? next : best),
      null,
    )?.nodeId ?? null
  );
}
