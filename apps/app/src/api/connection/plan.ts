import type { DesktopServiceHealth } from '@smarteverything/domain';
import type { AppPlatform } from '../../design/platform';
import type { StoredKind } from './storage';

export interface ConnectionFacts {
  readonly form: AppPlatform;
  readonly localServer: DesktopServiceHealth | null;
  readonly preferRemote: boolean;
}

export type ConnectionPlan =
  { readonly kind: 'local' } | { readonly kind: 'stored'; readonly storage: StoredKind };

const SERVING: ReadonlySet<DesktopServiceHealth> = new Set(['running', 'starting']);

export function connectionPlanOf(facts: ConnectionFacts): ConnectionPlan {
  switch (facts.form) {
    case 'android':
      return { kind: 'stored', storage: 'phone' };
    case 'web':
      return { kind: 'stored', storage: 'browser' };
    case 'desktop':
      return !facts.preferRemote && facts.localServer !== null && SERVING.has(facts.localServer)
        ? { kind: 'local' }
        : { kind: 'stored', storage: 'browser' };
  }
}

export function serverHostOf(url: string): string {
  return new URL(url).host;
}
