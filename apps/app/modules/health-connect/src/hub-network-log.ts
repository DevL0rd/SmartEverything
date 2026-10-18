import { Logger, redactText } from '@smarteverything/logging';
import type { NativeHubRouteSnapshot } from '@smarteverything/domain';

export const log = new Logger('app.hub-network');
export function failureOf(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { errorName: typeof error };
  const code: unknown = Reflect.get(error, 'code');
  return {
    errorName: error.name,
    ...(typeof code === 'string' || typeof code === 'number' ? { errorCode: code } : {}),
    cause: redactText(error.message, 160),
  };
}
export async function timed<T>(
  event: string,
  facts: Readonly<Record<string, unknown>>,
  work: () => Promise<T>,
  summary?: (value: T) => Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  log.debug(`${event}.started`, facts);
  try {
    const value = await work();
    log.debug(`${event}.finished`, () => ({
      ...facts,
      elapsedMs: Date.now() - startedAt,
      ...(summary === undefined ? {} : summary(value)),
    }));
    return value;
  } catch (error) {
    log.warn(`${event}.failed`, {
      ...facts,
      elapsedMs: Date.now() - startedAt,
      ...failureOf(error),
    });
    throw error;
  }
}
export function countedListener(
  event: string,
  facts: (value: unknown) => Record<string, unknown>,
  listener: (value: unknown) => void,
): (value: unknown) => void {
  let received = 0;
  return (value) => {
    received += 1;
    log.debug(`${event}.received`, () => ({ received, ...facts(value) }));
    listener(value);
  };
}
export function routeSummary(state: NativeHubRouteSnapshot): Record<string, unknown> {
  return {
    readiness: state.readiness,
    kind: state.readiness === 'ready' ? state.endpoint.kind : 'none',
    routeGeneration: state.routeGeneration,
    networkGeneration: state.networkGeneration,
  };
}
