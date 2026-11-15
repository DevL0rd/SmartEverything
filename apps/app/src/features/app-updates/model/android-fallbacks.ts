import type { PairedAndroidBuild } from '@smarteverything/domain';

export interface AwaitingFallback {
  readonly clientId: string;
  readonly updateId: string | null;
  readonly recordedAt: string;
}

export function awaitingFallbacks(
  builds: readonly PairedAndroidBuild[],
): readonly AwaitingFallback[] {
  return builds.flatMap(({ clientId, observation }) => {
    const outcome = observation.lastOutcome;
    if (outcome?.outcome !== 'fell_back') return [];
    return [{ clientId, updateId: outcome.updateId, recordedAt: outcome.recordedAt }];
  });
}

export function fallbackLine(fallback: AwaitingFallback): string {
  const update = fallback.updateId === null ? 'The last update' : `Update ${fallback.updateId}`;
  return `${update} could not start, so the phone went back to the version it ran before. Choose on that phone: Try the update again or Stay on the built-in version.`;
}
