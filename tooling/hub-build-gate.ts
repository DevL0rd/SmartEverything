import { buildSourceOf } from '../apps/hub/src/self-update/build-source.ts';
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import type { BuildKind } from './build-scope.ts';

const ARTIFACT_NAMES: Readonly<Record<BuildKind, string>> = {
  hub: 'the Hub service',
  app: 'the Android app',
  ui: 'the app UI update',
  desktop: 'the Desktop release',
};

export class HubBuildSourceError extends Error {
  override readonly name = 'HubBuildSourceError';
}

const PROVIDE =
  'Build it on a dev machine and provide it, or set the build source to hub and run tooling/provision-build-host.ts on the Hub.';

export function requireHubSource(
  layout: HubLayout,
  kind: BuildKind,
  settle?: (error: HubBuildSourceError) => void,
): void {
  const source = buildSourceOf(layout, kind);
  if (source === 'hub') return;
  const error = new HubBuildSourceError(
    `The Hub does not build ${ARTIFACT_NAMES[kind]}: its build source is ${source}, not hub. ${PROVIDE}`,
  );
  settle?.(error);
  throw error;
}

export function requireAnyHubSource(layout: HubLayout, kinds: readonly BuildKind[]): void {
  const sources = kinds.map((kind) => buildSourceOf(layout, kind));
  if (sources.includes('hub')) return;
  throw new HubBuildSourceError(
    `No artifact has the build source hub, so the Hub plans no build from the checkout. ${PROVIDE}`,
  );
}
